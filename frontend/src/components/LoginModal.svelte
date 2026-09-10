<script lang="ts">
  import { onMount } from "svelte";
    import { setAuthCredentials } from "../helpers/auth";

  let show = false;
  let username = "";
  let password = "";
  let errorMsg = "";

  onMount(() => {
      window.addEventListener("require-login", () => {
          show = true;
      });
  });

  async function login() {
      if (!username || !password) {
          errorMsg = "Please enter both fields.";
          return;
      }
      await setAuthCredentials(username, password);
      show = false;
      errorMsg = "";
  }
</script>

{#if show}
  <div class="modal">
    <div class="modal-content">
      <h2>Secure Login</h2>
      <p style="font-size: 0.9em; color: #555;">
        Authentication required
      </p>
      {#if errorMsg}<p style="color: red; font-size: 0.8em; margin: 0;">
          {errorMsg}
        </p>{/if}
      <input placeholder="Username" bind:value={username} />
      <input type="password" placeholder="Password" bind:value={password} />
      <div
        style="display:flex; justify-content: flex-end; gap: 10px; margin-top: 10px;"
      >
        <button class="btn-cancel" on:click={() => (show = false)}
          >Cancel</button
        >
        <button type="submit" class="btn-save" on:submit={login} on:click={login}>Save on Device</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
  }
  .modal-content {
    background: white;
    padding: 20px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 300px;
    max-width: 90%;
    color: black;
    font-family: sans-serif;
  }
  .modal-content h2 {
    margin: 0;
  }
  input {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 16px;
  }
  .btn-save {
    padding: 10px 15px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: bold;
  }
  .btn-cancel {
    padding: 10px 15px;
    background: #ccc;
    color: black;
    border: none;
    border-radius: 6px;
  }
</style>
