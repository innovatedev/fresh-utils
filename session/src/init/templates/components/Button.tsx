import type { JSX } from "preact";

export function Button(props: JSX.IntrinsicElements["button"]) {
  return <button {...props} />;
}
