import postcss from "postcss"
import loadConfig from "postcss-load-config"

let plugins = null
let options = null

beforeAll(() =>
  loadConfig({ map: false }).then((config) => {
    plugins = config.plugins
    options = config.options
    return true
  })
)

// We add some super basic formatting to our CSS to make snapshots better readable
// and inspectable in case of any regressions later on.
function format(cssString) {
  return cssString
    .replace(/;/g, ";\n")
    .replace(/}/g, "\n}\n\n")
    .replace(/{/g, "{\n")
    .replace(/}\n\n\n}/g, "}\n}\n\n")
    .trim()
}

function compile(input) {
  let allOptions = { ...options, from: "__tests__/main.css", to: "__tests__/dist/main.css" }

  return postcss(plugins)
    .process(input, allOptions)
    .then((result) => expect(format(result.css)).toMatchSnapshot())
}

test("Smart Import Basic", () =>
  compile("@import './fixtures/import-a.css';")
)

test("Smart Import with Merge", () =>
  compile("@import './fixtures/import-b.css'; .section { background: #333; }")
)

test("Simple URL", () =>
  compile("background: url('./fixtures/image.png');")
)

test("Lost Grid", () =>
  compile(".grid { lost-column: 3/12 }")
)

test("Autoprefixer", () =>
  compile(":fullscreen a { display: flex }")
)

test("Sassy Mixins", () =>
  compile("@mixin simple{ color: red; } h1 { @include simple; }")
)

test("Sassy Variables", () =>
  compile("$bgColor: red; h1 { background: $bgColor; }")
)

test("Nested Basic", () =>
  compile("body { h1 { font-weight: bold; } h2 { font-weight: normal; }}")
)

test("Nested Parent Selector", () =>
  compile("body { ul { li { &:first-child { margin-top: 0; }}}}")
)

test("Grid KISS", () =>
  compile(`
    .gridTest {
    	grid-kiss:
    		"+-------------------------------+      "
    		"|           header ↑            | 120px"
    		"+-------------------------------+      "
    		"                                       "
    		"+-- 30% ---+  +--- auto --------+      "
    		"| .sidebar |  |       main      | auto "
    		"+----------+  +-----------------+      "
    		"                                       "
    		"+-------------------------------+      "
    		"|              ↓                | 60px "
    		"|         → footer ←          |      "
    		"+-------------------------------+      "
    }
  `)
)

test("Calc Trivial", () =>
  compile(".elem { width: calc(300px + 10px); }")
)

test("Calc Variable", () =>
  compile("$margin: 10px; .elem { width: calc(200px + $margin); }")
)

test("Calc Keep", () =>
  compile(".elem { width: calc(100px + 2%); }")
)

test("zIndex", () =>
  compile(".first { z-index: 1000; } .second { z-index: 2000; }")
)