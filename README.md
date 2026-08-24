# tldx

Write architecture and flow diagrams as JSX. `tldx` lays them out and renders
them on a live [tldraw](https://tldraw.dev) canvas that reloads as you save.

You describe *what connects to what*. Layout, sizing, edge routing and label
placement are the tool's job — there are no coordinates in a `.tldx.jsx` file
unless you want them.

## Install

```bash
npm i -g tldx
```

`tldx render` additionally needs Playwright, which is optional because it pulls
a browser binary:

```bash
npm i -g playwright && npx playwright install chromium
```

## A diagram

```jsx
// hello.tldx.jsx
import { Doc, Frame, Box, Edges } from "tldx";

export default function Hello() {
  return (
    <Doc layout="col" gap="80">
      <Box id="browser" label="Browser" color="grey" />

      <Frame id="system" name="acme.com" layout="row" gap="48">
        <Box id="api" label="API" />
        <Box id="cache" label="Redis" geo="ellipse" color="red" />
        <Box id="db" label="Postgres" geo="ellipse" color="blue" />
      </Frame>

      <Edges>{`
        browser -> api: HTTPS
        api -> cache: read-through
        api -> db
      `}</Edges>
    </Doc>
  );
}
```

```bash
tldx serve hello.tldx.jsx
```

That opens a browser tab and repaints on every save. Because it's JSX, a
diagram is ordinary code: components for repeated shapes, `.map()` over a data
table, `import` a shared palette from another file.

## Commands

```
tldx serve   <file>        watch and push to the live viewer
tldx check   <file>        parse + validate, exit non-zero on error
tldx render  <file> <out>  export a PNG/SVG, cropped to content
tldx measure <file>        print every shape's id, size and position
tldx absorb  <file>        fold canvas edits back into the source
tldx verify  <file>        does the source alone reproduce the canvas?
tldx overlay show <file>   what canvas edits are still unabsorbed
```

## Claude Code plugin

The `plugin/` directory ships `tldx` as a Claude Code plugin: a `PostToolUse`
hook that validates and renders a diagram every time the agent edits one, a
`/tldx:sync` command that folds canvas edits back into source, and a skill
teaching the component vocabulary.

```
/plugin marketplace add zhebil/tldx
/plugin install tldx@tldx
```

It calls the `tldx` binary on your `PATH`, so install the CLI first.

## Examples

[`examples/`](examples/) has five: a three-tier web stack, an RFC 793 TCP state
machine, a Kafka event pipeline, a CI/CD pipeline, and an OS kernel map.

```bash
tldx serve examples/web-architecture.tldx.jsx
```

## Docs

- [`docs/reference.md`](docs/reference.md) — every component, prop and enum
- [`docs/architecture.md`](docs/architecture.md) — how the compiler works

## Development

```bash
npm run check                                  # typecheck + lint + dep-lint + tests
npm run dev:cli -- serve examples/kernel.tldx.jsx   # run from source, no build
```

## License

MIT — see [LICENSE](LICENSE).

That covers tldx's own source. The viewer bundles the
[tldraw](https://tldraw.dev) SDK, which is separately licensed — free for local
and development use, commercial license required to deploy it as a service for
end users. Details in [NOTICE](NOTICE); the full text ships in
`licenses/tldraw-LICENSE.md`.

Using `tldx` locally to draw diagrams is development use, and needs no license.
