// Desktop wrapper: opens the same index.html the phone app uses, in its own window.
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 380,
    minHeight: 500,
    title: "Back of the Box",
    icon: path.join(__dirname, "icons", "icon-256.png"),
    backgroundColor: "#F3EEE6",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  win.loadFile(path.join(__dirname, "index.html"));

  // Links to other sites open in the regular browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); }
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
