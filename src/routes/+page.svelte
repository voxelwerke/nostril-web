<script lang="ts">
  import license from "../../LICENSE?raw";
</script>

<main>
  <h1>Nostr<span>il</span><b>!</b></h1>

  <p>Nostril is <b>REINVENTING CHAT</b>.</p>

  <p>iOS / Android.</p>

  <ol class="featuring">
    <li>
      <b>Simple</b><br />
      Nostril is simple software, because
      <a href="https://en.wikipedia.org/wiki/Worse_is_better">worse is better</a
      >.
    </li>
    <li>
      <b><a href="https://www.calmtech.institute/kyoto">Calm</a></b>
      <br />Designed to be satisfying, not addictive.
    </li>
    <li>
      <b>Respectful</b>
      <br />

      No tracking. Read without being profiled, like things explicitly.
    </li>
    <li>
      <b>Private</b><br />
      Private, but not
      <a href="https://signal.org">Secure</a>.
    </li>
  </ol>

  <h3>Source code</h3>

  <cite>
    <a href="https://github.com/voxelwerke/nostril-ios">Github</a>
  </cite>

  <h3>License</h3>

  <div class="license">
    <pre>{license}</pre>
  </div>
</main>

<style>
  .license {
    opacity: 0.5;
    font-size: x-small;
    line-height: 1.5;
  }

  .featuring {
    li::marker {
      color: var(--acid);
    }

    li {
      margin-bottom: 1rem;
    }

    b {
      color: var(--laser);
    }
  }

  p b {
    color: var(--acid);
  }
</style>
