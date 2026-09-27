import { Application } from 'pixi.js';

import { navigation } from './app/navigation';
import { account } from './net/account';
import { HomeScreen } from './screens/HomeScreen';
import { LoadScreen } from './screens/LoadScreen';

async function boot() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#1b1033',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('app')?.appendChild(app.canvas);
  app.stage.addChild(navigation.root);

  const resize = () => navigation.resize(app.screen.width, app.screen.height);
  window.addEventListener('resize', resize);
  resize();
  app.ticker.add((ticker) => navigation.update(ticker));

  const loader = new LoadScreen();
  await navigation.goTo(loader);
  await loader.load();
  // Who is signed in (for the leaderboard); never blocks start-up.
  void account.refresh();

  const params = new URLSearchParams(window.location.search);
  if (import.meta.env.DEV && params.has('demo')) {
    const { runDemo } = await import('./dev/demo');
    await runDemo(params);
    return;
  }
  await navigation.goTo(new HomeScreen(params.get('room') ?? undefined));
}

void boot();
