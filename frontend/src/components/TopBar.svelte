<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import LoginModal from "./LoginModal.svelte";
  import { API_BASE, VISITOR_COUNT_REFRESH_INTERVAL } from "../helpers/Constants";

  export let title: string;
  export let showSidebarToggle: boolean = false;
  export let showVisitorCount: boolean = true;
  export let statusText: string | null = null;

  const dispatch = createEventDispatcher<{
      toggleSidebar: void;
  }>();

  let visitorCount: number = 1;

  onMount(() => {
      if (showVisitorCount) {
          let visitorId = localStorage.getItem("visitorId");
          if (!visitorId) {
              visitorId = Math.random().toString(36).substring(2) + Date.now().toString(36);
              localStorage.setItem("visitorId", visitorId);
          }

          const fetchVisitors = async () => {
              try {
                  const res = await fetch(API_BASE + `/api/visitors?id=${visitorId}`);
                  const data = await res.json();
                  visitorCount = data.count;
              } catch (e) {
                  console.error("Failed to fetch visitors", e);
              }
          };

          fetchVisitors();
          // Refresh visitor count every minute
          const visitorInterval = setInterval(fetchVisitors, VISITOR_COUNT_REFRESH_INTERVAL);

          return () => {
              clearInterval(visitorInterval);
          };
      }
  });
</script>

<div class="controls">
  <div style="display:flex; align-items:center; gap:10px;">
    {#if showSidebarToggle}
      <button
        class="sidebar-toggle-btn"
        on:click={() => dispatch("toggleSidebar")}
      >
        ☰ Places
      </button>
    {/if}
    <h1 style="margin:0;">{title}</h1>
    {#if showVisitorCount}
      <span
        style="font-size: 0.9em; color: #555; background: #eee; padding: 2px 8px; border-radius: 12px; white-space: nowrap;"
      >
        Live counter: {visitorCount}
      </span>
    {/if}
  </div>
  <div class="buttons">
    <slot name="buttons"></slot>
  </div>
  {#if statusText}
    <div class="status">{statusText}</div>
  {/if}
</div>
<LoginModal />
