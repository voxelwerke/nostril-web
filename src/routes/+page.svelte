<script lang="ts">
  import license from "../../LICENSE?raw";
</script>

<main>
  <h1>Nostr<span>il</span><b>!</b></h1>

  <p>Nostril is <b>REINVENTING CHAT</b>.</p>

  <p>iOS / Android.</p>

  <a href="apple.com/"
    ><div class="ios-icon">
      <b>N</b><i>!</i><br />
      <span>iPhone</span>
    </div>
  </a>

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

  .ios-icon {
    border-radius: 1rem;
    box-shadow: 2px 2px 5px black;
    display: inline-block;
    background: linear-gradient(to bottom, var(--acid), var(--laser));
    width: 150px;
    height: 150px;
    text-align: center;

    b {
      font-size: 120px;
      line-height: 150px;
      text-align: center;
      color: var(--void);
      font-family: "Raleway", system-ui, sans-serif;
      text-shadow: 2px 2px 0 var(--chill);
    }

    i {
      font-size: 110px;
      line-height: 150px;
      text-align: center;
      color: var(--acid);
      font-family: "comic sans ms", system-ui, sans-serif;
      font-style: normal;
      font-weight: bold;
      text-shadow: 2px 2px 0 var(--chill);
    }
  }
</style>
