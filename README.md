# Fan 360 demo: professional baseball club

A demonstration of a Fan 360 view for a professional baseball club. It moves through seven tabs, from today's single-system dashboards to linked fans, segments and recommendations:

- Tabs 1 to 3 (Ticketing & Entry, F&B & Retail, Groups & Experiences) show each source system on its own.
- Tab 4 (Fan 360) is the linked view of fans across those systems.
- Tab 5 (Individual View) shows one fan's profile, with restricted fields shown or masked by role.
- Tab 6 (Segment Builder) filters fans into an audience and shows consent and projected reach.
- Tab 7 (Segment Recommendations) runs pattern detection across linked records. Each card opens in the Segment Builder.

## Synthetic data

All data in this demo is synthetic. It is modeled from a 20,000-record synthetic sample and scaled ×25 for display. It contains no real team data and no real systems. Contact details use reserved example domains and fictional phone numbers.

The demo was prepared by Resultant.

## Open it locally

- Open `index.html` directly in a browser. It needs no server and no network connection.
- Or run `python3 -m http.server` in this folder, then go to http://localhost:8000/.

## Development

Requires Node 18 or later. There are no dependencies to install.

- `npm test` runs the test suite.
- `npm run build` regenerates `index.html` from `src/`.

`src/` holds the data generator, identity linkage, views and UI. `test/` holds the tests. `vendor/` holds Chart.js and `assets/` holds the wordmark.
