import { createContext } from "react";

export const ShellActionsContext = createContext({
  openBookmarks: () => {},
  dialogOpen: false,
});
