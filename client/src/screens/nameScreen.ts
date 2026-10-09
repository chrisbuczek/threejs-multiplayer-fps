import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "@mp-fps/shared";
import { h } from "../dom";
import { loadPlayerName } from "../settings";
import type { Screen } from "./screen";

/** First screen: just a name, no account. */
export class NameScreen implements Screen {
  private el: HTMLElement | null = null;

  constructor(private readonly onSubmit: (name: string) => Promise<void>) {}

  mount(root: HTMLElement): void {
    const input = h("input", {
      className: "input",
      placeholder: "Your name",
      maxlength: NAME_MAX_LENGTH,
      value: loadPlayerName(),
      autofocus: true,
    });
    const error = h("p", { className: "form-error" });
    const button = h("button", {
      className: "btn btn-primary",
      type: "submit",
      text: "Play",
    });

    const form = h("form", { className: "name-form" }, input, button, error);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (name.length < NAME_MIN_LENGTH) {
        error.textContent = `Name needs at least ${NAME_MIN_LENGTH} characters`;
        return;
      }
      button.disabled = true;
      error.textContent = "";
      try {
        await this.onSubmit(name);
      } catch (e) {
        error.textContent = (e as Error).message;
        button.disabled = false;
      }
    });

    this.el = h(
      "div",
      { className: "screen screen-center menu-bg" },
      h(
        "div",
        { className: "panel name-panel" },
        h("h1", { className: "logo", text: "THREEJS MULTIPLAYER FPS" }),
        h("p", { className: "muted", text: "Enter a name to deploy" }),
        form,
      ),
    );
    root.append(this.el);
    input.focus();
  }

  unmount(): void {
    this.el?.remove();
  }
}
