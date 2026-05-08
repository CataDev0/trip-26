import './app.css'
import App from './App.svelte'
import Edit from './Edit.svelte'
import Suite from './Suite.svelte'

// Super simple SPA routing check
const routes = {
  '/': App,
  '/edit': Edit,
  '/suite': Suite
};

const path = window.location.pathname;
const Component = routes[path] || App; // Default to App if route not found

const app = new Component({
  target: document.getElementById('app'),
})

export default app