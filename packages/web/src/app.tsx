import { Route, Switch } from "wouter-preact";
import { Header } from "./components/Header.tsx";
import { SearchPage } from "./pages/Search.tsx";
import { NostrProfile } from "./pages/NostrProfile.tsx";
import { MastodonAccount } from "./pages/MastodonAccount.tsx";
import { RssFeed } from "./pages/RssFeed.tsx";
import { RssItem } from "./pages/RssItem.tsx";
import { ContentPage } from "./pages/Content.tsx";
import { Home } from "./pages/Home.tsx";
import { Likes } from "./pages/Likes.tsx";
import { storageOk } from "./store/db/status.ts";

function StorageWarning() {
  if (storageOk.value !== false) return null;
  return (
    <div class="storage-warning">
      Storage unavailable — your likes and follows won't be saved after you close this tab.
    </div>
  );
}

export function App() {
  return (
    <>
      <Header />
      <StorageWarning />
      <main>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/likes" component={Likes} />
          <Route path="/search" component={SearchPage} />
          <Route path="/nostr/:npub" component={NostrProfile} />
          <Route path="/mastodon/:instance/:acct" component={MastodonAccount} />
          <Route path="/rss/feeds/:id" component={RssFeed} />
          <Route path="/rss/items/:id" component={RssItem} />
          <Route path="/c/:uri" component={ContentPage} />
          <Route>
            <p>Not found.</p>
          </Route>
        </Switch>
      </main>
    </>
  );
}
