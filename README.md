# Stream.ly

**Find your next favorite.**

Stream.ly is an independent video-sharing platform concept built around creator discovery, long-form videos, clips, and communities.

## Run locally

No build tools or package installation required.

1. Clone or download this repository.
2. Open `index.html` in a modern browser.

For a local web server, run `python -m http.server 8000` in the project directory and visit `http://localhost:8000`.

## Current experience

- Responsive video discovery feed with category filtering and search
- Creator navigation, featured video, and video details
- Working like/save interactions and a local upload flow
- Keyboard shortcut `Ctrl/Cmd + K` to focus search
- Responsive desktop and mobile navigation

The upload flow previews a selected video locally in the current browser session. Shared publishing, accounts, comments, and hosted playback require a backend and video storage service; this repository currently contains the front-end experience.

## Stack

Vanilla HTML, CSS, and JavaScript. No build step or framework required.

## License

See [LICENSE](LICENSE).
