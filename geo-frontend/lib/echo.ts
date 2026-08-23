import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window {
    Pusher: typeof Pusher;
    Echo: Echo;
  }
}

let echo: Echo | null = null;

export const getEcho = () => {
  if (typeof window === 'undefined') return null;
  if (echo) return echo;

  window.Pusher = Pusher;

  echo = new Echo({
    broadcaster: 'reverb',
    key: process.env.NEXT_PUBLIC_REVERB_APP_KEY!,
    wsHost: process.env.NEXT_PUBLIC_REVERB_HOST,
    wsPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT) || 8080,
    wssPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT) || 8080,
    forceTLS: process.env.NEXT_PUBLIC_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
  });

  return echo;
};