import type { ReactElement } from "react";
import { render } from "@react-email/render";

export async function renderEmail(element: ReactElement) {
  const html = await Promise.resolve(render(element));
  const text = await Promise.resolve(render(element, { plainText: true }));
  return { html, text };
}
