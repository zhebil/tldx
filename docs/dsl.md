# DSL syntax

XML / JSX-flavored. Self-closing tags for leaves, paired tags for containers, attributes for modifiers. Chosen for structural clarity over compactness; LLMs are heavily trained on this style.

Markdown-style was considered first but didn't express unrestricted nesting cleanly. XML wins on structure; verbosity for edges is the trade-off (see `roadmap.md` open questions for the `<edges>` block idea).

## Phase 1 elements

| element | purpose |
|---|---|
| `<doc>...</doc>` | root wrapper for the main file |
| `<frame name="..." pad="..." bg="..." border="...">...</frame>` | **visual** container - has chrome (border, title) |
| `<group layout="..." gap="..." cols="..." align="...">...</group>` | **invisible** layout container - never accepts visual attrs |
| `<box id="..." label="..." />` | labelled box |
| `<shape kind="...">...</shape>` | other tldraw-supported shapes (ellipse, diamond, etc.) |
| `<text>...</text>` | free text block |
| `<note>...</note>` | standalone sticky note (with explicit position) |
| `<line ... />` | freehand or geometric line |
| `<edge from="..." to="..." />` | arrow / connection |
| `<import name="..." from="..." />` | bring in another DSL file |
| `<use name="..." />` | place an imported sub-doc |

Comments compile to stickies: `<!-- explains the auth flow -->` becomes a sticky note anchored to the nearest following element. `<note>` exists for stickies that need explicit position.

## Group vs frame - why the split

`<frame>` is a **visual** primitive (tldraw's frame: border + title chrome). `<group>` is an **invisible layout** primitive (no rendered chrome).

The hard rule: **`<group>` never accepts visual attributes** (no `pad`, `bg`, `border`). The moment groups have padding, users start treating them as frameless frames and the distinction collapses - leading to cluttered diagrams polluted with structural decoration the user didn't ask for.

Both `<group>` and `<frame>` carry layout attributes (`layout`, `gap`, `cols`, `align`).

## Layout modes

Any container can declare `layout="..."`:

| mode | behavior |
|---|---|
| `free` *(default)* | elements positioned by explicit `x y` or engine heuristic |
| `row` | left-to-right; respects `gap` and `align` |
| `col` | top-to-bottom; respects `gap` and `align` |
| `grid cols=N` | N-column grid |
| `auto` | ELK full graph layout (topology-aware) |

Hard pin overrides everything: `<box id="api" x="100" y="200" />`. Layout context stays inside the parent container - adding a child to one frame doesn't move siblings of that frame.

## Edges

13 named anchors per shape: `top-left`, `top`, `top-right`, `right`, `bottom-right`, `bottom`, `bottom-left`, `left`, `center`, plus four edge-midpoints for port-style addressing. Addressed as `api.bottom`.

Default attach is **center on both ends**. Multiple arrows on one anchor are visually offset by the renderer - they stay semantically attached to the center.

| usage | meaning |
|---|---|
| `<edge from="A" to="B" />` | one-way arrow (default) |
| `<edge from="A" to="B" type="bi" />` | bidirectional |
| `<edge from="A" to="B" type="line" />` | plain line, no arrowheads |
| `<edge from="A.bottom" to="B.top" />` | pinned anchors |
| `<edge from="x:100,y:200" to="A.left" />` | free endpoint (absolute) |
| `<edge from="x:50%,y:0" to="A" />` | free endpoint (relative to bbox) |
| `<edge route="curved\|elbow\|straight" />` | route shape |
| `<edge head-start="dot" head-end="arrow" />` | independent end decorators (`none`, `arrow`, `dot`, `triangle`, `diamond`, `bar`) |

Waypoints: `<via x y />` children on an `<edge>` to force the path through a point. Labels: multiple `<label pos="start|middle|end">...</label>` children.

## Imports

```xml
<import name="auth" from="./auth.tldsl" />
<use name="auth" />
```

Why imports matter:

- LLM editing degrades on 5000-line files; 200-line subdocs keep the edit context tight.
- Subdocs are independently versionable in git.
- Multi-page diagrams fall out naturally without a special page primitive.
- Each subdoc has its own layout scope - re-layout doesn't ripple to the main doc.

## Full example

```xml
<!-- auth.tldsl -->
<frame name="Auth" pad="16">
  <box id="login"   label="Login form" />
  <box id="verify"  label="Verify creds" />
  <box id="session" label="Issue session" />
  <text>All requests must include CSRF token</text>
  <!-- TODO: rate-limit verify endpoint -->

  <edge from="login"  to="verify" />
  <edge from="verify" to="session" />
</frame>
```

```xml
<!-- main.tldsl -->
<doc>
  <import name="auth"    from="./auth.tldsl" />
  <import name="billing" from="./billing.tldsl" />
  <import name="notifs"  from="./notifs.tldsl" />

  <group layout="grid" cols="2" gap="32">
    <use name="auth" />
    <use name="billing" />
    <use name="notifs" />
  </group>

  <frame name="Backend" pad="24" layout="auto">
    <box id="api" label="API" />
    <box id="db"  label="Postgres" />

    <group layout="row" gap="8">
      <box id="worker_a" label="Worker A" />
      <box id="worker_b" label="Worker B" />
    </group>

    <edge from="api" to="db" />
    <edge from="api" to="worker_a" />
    <edge from="api" to="worker_b" />
  </frame>

  <edge from="api.bottom" to="auth.login.top" type="bi" />
  <edge from="api"        to="notifs"        route="curved" />
</doc>
```
