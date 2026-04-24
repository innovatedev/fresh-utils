import { define } from "../utils.ts";

export default define.page(function App({ Component, state, url }) {
  return (
    <html>
      <body>
        <Component />
      </body>
    </html>
  );
});
