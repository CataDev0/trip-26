<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";

  export let title: string;
  export let showSidebarToggle: boolean = false;
  export let showVisitorCount: boolean = true;
  export let statusText: string | null = null;

  const dispatch = createEventDispatcher();

  let visitorCount: number = 1;

  onMount(() => {
    if (showVisitorCount) {
      const fetchVisitors = async () => {
        try {
          const res = await fetch("/api/visitors");
          const data = await res.json();
          visitorCount = data.count;
        } catch (e) {
          console.error("Failed to fetch visitors", e);
        }
      };
      
      fetchVisitors();
      const visitorInterval = setInterval(fetchVisitors, 5 * 60 * 1000);

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
        on:click={() => dispatch('toggleSidebar')}
      >
        ☰ Places
      </button>
    {/if}
    <h1 style="margin:0;">{title}</h1>
    {#if showVisitorCount}
      <span style="font-size: 0.9em; color: #555; background: #eee; padding: 2px 8px; border-radius: 12px; white-space: nowrap;">
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
