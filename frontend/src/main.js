import './app.css'
import App from './App.svelte'
import Edit from './Edit.svelte'

// Super simple SPA routing check
const isEdit = window.location.pathname === '/edit';
const Component = isEdit ? Edit : App;

const app = new Component({
  target: document.getElementById('app'),
})

export default app