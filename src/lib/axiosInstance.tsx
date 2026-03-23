import axios from "axios";

const DEFAULT_API_BASE_URL = "http://localhost:5005";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

const axiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/`,
  timeout: 10000, // Set a timeout of 10 seconds
  headers: {
    "Content-Type": "application/json",
  },
});

export const buildApiUrl = (path: string) =>
  new URL(path.replace(/^\//, ""), `${API_BASE_URL}/`).toString();

export default axiosInstance;
