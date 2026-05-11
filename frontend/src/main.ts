import "./app.css";
import App from "./App.svelte";
import Edit from "./Edit.svelte";
import Suite from "./Suite.svelte";

// Super simple SPA routing check
const routes = {
  "/": App,
  "/edit": Edit,
  "/suite": Suite,
};

const path = window.location.pathname;
const Component = path in routes ? routes[path as keyof typeof routes] : App; // Default to App if route not found

const app = new Component({
  target: document.getElementById("app") || document.body,
});

export default app;
