// src-tauri/src/lib.rs
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::{fs, thread, time::Duration};

use tauri::{Emitter, Manager, Window};

// Simple serializable model summary returned to the frontend
#[derive(Clone, serde::Serialize)]
struct ModelInfo {
  id: String,
  name: String,
  path: String,
  loaded: bool,
}

// Manager that keeps the running child process (if any) and loaded model id
struct ModelManager {
  // optional running child process
  process: Option<Child>,
  // which model is considered loaded (id)
  loaded: Option<String>,
  // discovered models (id -> ModelInfo)
  models: HashMap<String, ModelInfo>,
}

impl ModelManager {
  fn new() -> Self {
    let mut mgr = Self {
      process: None,
      loaded: None,
      models: HashMap::new(),
    };
    mgr.scan_models(); // initial scan
    mgr
  }

  // scan ./models directory for files/folders that look like models
  fn scan_models(&mut self) {
    self.models.clear();
    
    let dir = PathBuf::from("./models");
    println!("DEBUG: scanning folder = {:?}", dir);

    if let Ok(entries) = fs::read_dir(dir) {
      for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() {
          if let Some(ext) = p.extension() {
            if ext == "gguf" || ext == "bin" || ext == "pt" {
              let id = p.file_stem().unwrap().to_string_lossy().to_string();
              let name = p.file_name().unwrap().to_string_lossy().to_string();
              self.models.insert(
                id.clone(),
                ModelInfo { id, name, path: p.to_string_lossy().to_string(), loaded: false },
              );
            }
          }
        } else if p.is_dir() {
          // treat directory as model package
          let id = p.file_name().unwrap().to_string_lossy().to_string();
          let name = id.clone();
          self.models.insert(
            id.clone(),
            ModelInfo { id, name, path: p.to_string_lossy().to_string(), loaded: false },
          );
        }
      }
    }
  }

  fn list_models(&self) -> Vec<ModelInfo> {
    self.models.values().cloned().collect()
  }

  fn set_loaded(&mut self, id: &str) {
    if let Some(m) = self.models.get_mut(id) {
      m.loaded = true;
      self.loaded = Some(id.to_string());
    }
  }

  fn clear_loaded(&mut self) {
    if let Some(id) = &self.loaded {
      if let Some(m) = self.models.get_mut(id) {
        m.loaded = false;
      }
    }
    self.loaded = None;
  }

  // spawn a child process (mock or real). returns Err(msg) on failure
  fn spawn_for_model(&mut self, window: &Window, id: &str) -> Result<(), String> {
    if self.process.is_some() {
      return Err("A model process is already running".into());
    }

    // get model info
    let model = if let Some(m) = self.models.get(id) {
      m.clone()
    } else {
      return Err(format!("Model '{}' not found", id));
    };

    // Decide how to spawn:
    // - For dev/demo: spawn a tiny cross-platform python mock that prints tokens slowly
    // - For real usage: replace this block with the command to run your runtime (llama.cpp, whisper, etc.)
    #[cfg(target_os = "windows")]
    let mock_cmd = vec!["/C".to_string(), format!("python -u -c \"import time; [print('TOKEN', i) or time.sleep(0.12) for i in range(200)]\"")];
    #[cfg(not(target_os = "windows"))]
    let mock_cmd = vec!["-c".to_string(), "python3 -u -c 'import time\nfor i in range(200):\n print(f\"TOKEN {i}\")\n time.sleep(0.12)'\n".to_string()];

    // Actual real-world example: to use llama.cpp CLI you might run:
    // let exe = "./bin/llama.exe"; // or path to binary
    // let args = vec!["-m", &model.path, "--stream"];
    // Here we implement a simple fallback: if there's a runner script inside the model folder, run it.
    let mut command_opt: Option<Command> = None;

    // try: ./models/<id>/run.sh or run.bat (packagers often include a wrapper)
    let model_dir = PathBuf::from(&model.path);
    if model_dir.is_dir() {
      let run_sh = model_dir.join("run.sh");
      let run_bat = model_dir.join("run.bat");
      if run_sh.exists() {
        let mut c = if cfg!(target_os = "windows") { Command::new("sh") } else { Command::new("sh") };
        c.arg(run_sh.to_string_lossy().to_string());
        command_opt = Some(c);
      } else if run_bat.exists() {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(run_bat.to_string_lossy().to_string());
        command_opt = Some(c);
      }
    }

    // If no wrapper script, check for a single .exe in ./src-tauri/bin or ./bin
    if command_opt.is_none() {
      let local_exe = PathBuf::from("./src-tauri/bin/llama.exe");
      if local_exe.exists() {
        // example: llama.exe -m <model_path> --stream
        let mut c = Command::new(local_exe);
        c.args(["-m", &model.path, "--stream"]);
        command_opt = Some(c);
      }
    }

    // fallback to the python mock if nothing else found (this will work on dev machines with python)
    if command_opt.is_none() {
      // Use platform-safe approach to spawn the python mock via shell
      if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(&mock_cmd);
        c
          .stdout(Stdio::piped())
          .stderr(Stdio::piped());
        command_opt = Some(c);
      } else {
        let mut c = Command::new("sh");
        c.args(&mock_cmd);
        c
          .stdout(Stdio::piped())
          .stderr(Stdio::piped());
        command_opt = Some(c);
      }
    }

    // now spawn
    if let Some(mut c) = command_opt {
      c.stdout(Stdio::piped()).stderr(Stdio::piped());
      match c.spawn() {
        Ok(mut child) => {
          let stdout = child.stdout.take();
let stderr = child.stderr.take();

          // store child in manager
          self.process = Some(child);

          // clone window for event emission
          let w = window.clone();

          // spawn thread to read stdout and emit tokens
          thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            if let Some(out) = stdout {
              let reader = BufReader::new(out);
              for line in reader.lines().flatten() {
                // emit token/line to frontend
                let _ = w.emit("model-output", line.clone());
              }
            }
            if let Some(err) = stderr {
              let reader = BufReader::new(err);
              for line in reader.lines().flatten() {
                let _ = w.emit("model-output", format!("[ERR] {}", line));
              }
            }
            // notify frontend that process stopped
            let _ = w.emit("model-status", serde_json::json!({"running": false}));
          });

          // signal started
          let _ = window.emit("model-status", serde_json::json!({"running": true}));
          Ok(())
        }
        Err(e) => Err(format!("Failed to spawn child: {}", e)),
      }
    } else {
      Err("No command to run".into())
    }
  }

  fn stop_process(&mut self) -> Result<(), String> {
    if let Some(mut child) = self.process.take() {
      // try kill gracefully
      match child.kill() {
        Ok(_) => {
          let _ = child.wait();
          Ok(())
        }
        Err(e) => Err(format!("Failed to kill process: {}", e)),
      }
    } else {
      Err("No running process".into())
    }
  }
}

// Shared state wrapper for Tauri

// ------------------ Tauri commands ------------------

#[tauri::command]
fn list_models(state: tauri::State<'_, Mutex<ModelManager>>) -> Vec<ModelInfo> {
  let mgr = state.lock().unwrap();
  mgr.list_models()
}

#[tauri::command]
fn rescan_models(state: tauri::State<'_, Mutex<ModelManager>>) -> Vec<ModelInfo> {
  let mut mgr = state.lock().unwrap();
  mgr.scan_models();
  mgr.list_models()
}

#[tauri::command]
fn load_model(id: String, state: tauri::State<'_, Mutex<ModelManager>>) -> Result<(), String> {
  let mut mgr = state.lock().unwrap();
  mgr.set_loaded(&id);
  Ok(())
}

#[tauri::command]
fn start_model(id: String, window: Window, state: tauri::State<'_, Mutex<ModelManager>>) -> Result<(), String> {
  let mut mgr = state.lock().unwrap();
  mgr.spawn_for_model(&window, &id)
}

#[tauri::command]
fn stop_model(state: tauri::State<'_, Mutex<ModelManager>>) -> Result<(), String> {
  let mut mgr = state.lock().unwrap();
  mgr.stop_process()
}

#[tauri::command]
fn run_prompt(
  prompt: String,
  model: Option<String>,
  window: Window,
  state: tauri::State<'_, Mutex<ModelManager>>
) -> Result<(), String> {
  let mut mgr = state.lock().unwrap();
  // ... rest of function body unchanged ...
  if let Some(child) = mgr.process.as_mut() {
    if let Some(mut stdin) = child.stdin.as_mut() {
      if let Err(e) = writeln!(stdin, "{}", prompt) {
        return Err(format!("failed to write to stdin: {}", e));
      }
      return Ok(());
    }
  }

  if let Some(id) = model.or(mgr.loaded.clone()) {
    mgr.spawn_for_model(&window, &id)
  } else {
    Err("no model available to run prompt".into())
  }
}


// ------------------ run ------------------
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let manager = Mutex::new(ModelManager::new());

  tauri::Builder::default()
    .manage(manager)
    .invoke_handler(tauri::generate_handler![
      list_models,
      rescan_models,
      load_model,
      start_model,
      stop_model,
      run_prompt
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
