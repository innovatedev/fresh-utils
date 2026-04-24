import { define } from "../utils.ts";

export default define.page(function Home(ctx) {
  return <div>{ctx.state.shared}</div>;
});
