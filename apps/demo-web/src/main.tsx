import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { DemoApp } from "./app";
import { DemoProvider } from "./demo/context";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing");
}

createRoot(root).render(
  <StrictMode>
    <DemoProvider>
      <BrowserRouter>
        <DemoApp />
      </BrowserRouter>
    </DemoProvider>
  </StrictMode>
);
