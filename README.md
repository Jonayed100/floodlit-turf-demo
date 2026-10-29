# Floodlit — turf booking demo

A futuristic five-a-side turf booking website for showing to clients. Plain HTML, CSS and JavaScript: no build step, no framework, no backend. All turfs, teams and payments are fictional.

## Files

```
floodlit-turf-demo/
├── index.html        page structure (player view, owner dashboard, drawers)
├── css/style.css     all styling and animations
└── js/
    ├── data.js       turfs, prices, seeded availability (edit this to change content)
    ├── pitch3d.js    the animated floodlit pitch in the hero
    ├── app.js        finder, search, booking flow, my bookings, squad board
    └── owner.js      owner dashboard: schedule, charts, walk-ins, pricing
```

## Run it in VS Code

1. Unzip the folder and open it in VS Code (File > Open Folder).
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click `index.html` and choose **Open with Live Server**.

Double-clicking `index.html` also works. You need an internet connection for the fonts and the QR code library.

## Get a link to send clients

Any static host works. The quickest options:

- **Netlify Drop**: go to app.netlify.com/drop and drag the whole folder in. You get a link in seconds. Sign up free to keep it and rename it.
- **GitHub Pages**: push the folder to a repo, then Settings > Pages > deploy from the `main` branch.
- **Vercel** or **Render** (Static Site): connect the repo, no build command, publish directory is the root.

Two useful links to send:
- `your-site.com/` opens the player side
- `your-site.com/#owner` opens the owner dashboard directly

## What to show in a client meeting

1. **Hero**: the floodlights switch on and a match plays. Move the mouse to tilt the pitch.
2. **Smart search**: type "7-a-side in Mirpur tomorrow after 9pm" and press Search. The filters set themselves.
3. **Departure-board slots**: change the day or format and the slot chips flip over.
4. **Booking**: tap a time. Hold the slot (a 10-minute countdown starts), add extras, turn on **Split the cost** and watch teammates pay one by one, then pay (demo) and get a match pass with a QR code, Google Calendar and WhatsApp share.
5. **Live activity**: every 20 to 30 seconds another team books a slot and the board updates. If someone takes the slot you picked, you get told.
6. **Owner view**: click Owner view. Your booking appears on the schedule with a glowing outline. Add a walk-in, then drag the pricing sliders and switch back: player prices have changed.
7. **Squad board**: join a game, or post your own and watch players join.

## Customise

- Your name or company: search for `Demo built by` in `index.html`.
- Turfs, areas, prices, features: `FL.turfs` in `js/data.js`.
- Colours and fonts: the `:root` block at the top of `css/style.css`.
- Extras on the booking (ball, bibs, referee...): `ADDONS` in `js/app.js`.

## Making it real

This demo fakes the backend in the browser. For a production build:

- **Backend**: FastAPI or Node with PostgreSQL. Use an exclusion constraint on a time range per pitch so two bookings can never overlap.
- **Holds**: store a `held` booking with an expiry time, released by a background job.
- **Payments**: SSLCommerz or bKash in sandbox mode first, with idempotent payment callbacks.
- **Notifications**: a local SMS gateway for confirmations and reminders.
- **Smart search**: the current version uses simple pattern matching. Swap `parseQuery()` in `app.js` for an LLM call that returns the same filter object.
