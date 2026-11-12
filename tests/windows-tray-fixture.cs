using System;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

internal static class TrayFixture
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        // Exercise the tray without its shared per-user mutex so the real
        // installation can remain open during smoke and upgrade tests.
        var assemblyPath = Environment.GetEnvironmentVariable("BRIGHTSPACE_TEST_TRAY_ASSEMBLY")
            ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "PreviousTray.exe");
        var assembly = Assembly.LoadFrom(assemblyPath);
        var type = assembly.GetType("CompanionTray", true);
        using (var activation = new EventWaitHandle(false, EventResetMode.AutoReset))
        using (var tray = (ApplicationContext)Activator.CreateInstance(
            type, BindingFlags.Instance | BindingFlags.NonPublic, null, new object[] { activation, true }, null))
            Application.Run(tray);
    }
}
