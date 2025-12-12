import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "http://localhost:5005/", // Adjust the baseURL as needed
  timeout: 10000, // Set a timeout of 10 seconds
  headers: {
    "Content-Type": "application/json",
  },
});

export default axiosInstance;