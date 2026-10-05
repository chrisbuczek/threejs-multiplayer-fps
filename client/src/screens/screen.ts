/** Every full-page view (name entry, room list, lobby, game) implements this. */
export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
}
