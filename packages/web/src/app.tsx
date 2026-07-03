import { Route, Switch } from "wouter-preact";
import { Header } from "./components/Header.tsx";
import { SearchPage } from "./pages/Search.tsx";
import { NostrProfile } from "./pages/NostrProfile.tsx";
import { MastodonAccount } from "./pages/MastodonAccount.tsx";
import { RssFeed } from "./pages/RssFeed.tsx";
import { RssItem } from "./pages/RssItem.tsx";
import { ContentPage } from "./pages/Content.tsx";
import { Home } from "./pages/Home.tsx";

export function App() {
  return (
    <>
      <Header />
      <main>
        <Switch>
          <Route path="/" component={Home} />
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
