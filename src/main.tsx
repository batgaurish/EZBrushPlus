import { createRoot } from "react-dom/client";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/900.css";
import "@fontsource/lilita-one";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/800.css";
import "./style.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
