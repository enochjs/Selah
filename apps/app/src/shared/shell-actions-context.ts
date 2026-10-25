import { createContext } from "react";

export const ShellActionsContext = createContext({
  openSearch: () => {},
  openBookmarks: () => {},
  dialogOpen: false,
});
