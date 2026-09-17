param([string]$StartPath = "")

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class DoveeFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
  private class FileOpenDialog {}

  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
    void GetResults(out IntPtr ppenum);
    void GetSelectedItems(out IntPtr ppsai);
  }

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }

  [DllImport("user32.dll")]
  private static extern IntPtr GetForegroundWindow();

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  private static extern void SHCreateItemFromParsingName(
    [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
    IntPtr pbc,
    [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
    out IShellItem ppv
  );

  private const uint FOS_PICKFOLDERS = 0x00000020;
  private const uint FOS_FORCEFILESYSTEM = 0x00000040;
  private const uint FOS_NOCHANGEDIR = 0x00000008;
  private const uint SIGDN_FILESYSPATH = 0x80058000;

  public static string Pick(string startPath) {
    var dialog = (IFileOpenDialog)new FileOpenDialog();
    dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR);
    dialog.SetTitle("Open Folder");
    dialog.SetOkButtonLabel("Select Folder");
    if (!string.IsNullOrWhiteSpace(startPath)) {
      try {
        IShellItem folder;
        SHCreateItemFromParsingName(startPath, IntPtr.Zero, typeof(IShellItem).GUID, out folder);
        dialog.SetFolder(folder);
      } catch {}
    }
    int hr = dialog.Show(GetForegroundWindow());
    if (hr != 0) return null;
    IShellItem result;
    dialog.GetResult(out result);
    string path;
    result.GetDisplayName(SIGDN_FILESYSPATH, out path);
    return path;
  }
}
"@

try {
  [DoveeFolderPicker]::Pick($StartPath)
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Open Folder"
  $dialog.ShowNewFolderButton = $true
  if ($StartPath -and (Test-Path -LiteralPath $StartPath)) {
    $dialog.SelectedPath = $StartPath
  }
  $form = New-Object System.Windows.Forms.Form
  $form.TopMost = $true
  $form.ShowInTaskbar = $false
  $form.WindowState = "Minimized"
  try {
    [void][System.Windows.Forms.Application]::EnableVisualStyles()
    $result = $dialog.ShowDialog($form)
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
      $dialog.SelectedPath
    }
  } finally {
    $form.Dispose()
    $dialog.Dispose()
  }
}
