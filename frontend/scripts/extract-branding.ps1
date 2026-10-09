param(
    [string]$Source = (Join-Path $PSScriptRoot '../public/nexadesk-branding.png'),
    [string]$Destination = (Join-Path $PSScriptRoot '../public/branding')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# The supplied PNG contains a baked-in, nearly neutral checkerboard. Isolate its
# blue/cyan/navy artwork without tracing, changing lettering, or replacing colors.
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class NexaDeskBrandAssets {
    public static void Extract(string sourcePath, string outputDirectory) {
        Directory.CreateDirectory(outputDirectory);
        using (var source = new Bitmap(sourcePath))
        using (var cutout = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb)) {
            int left = source.Width, top = source.Height, right = -1, bottom = -1;
            bool[] columns = new bool[source.Width];
            for (int y = 0; y < source.Height; y++) {
                for (int x = 0; x < source.Width; x++) {
                    Color pixel = source.GetPixel(x, y);
                    int spread = Math.Max(pixel.R, Math.Max(pixel.G, pixel.B)) - Math.Min(pixel.R, Math.Min(pixel.G, pixel.B));
                    if (spread < 24 || pixel.B < pixel.R + 20) continue;
                    cutout.SetPixel(x, y, UnmatteEdge(source, x, y, pixel));
                    columns[x] = true;
                    left = Math.Min(left, x); right = Math.Max(right, x);
                    top = Math.Min(top, y); bottom = Math.Max(bottom, y);
                }
            }
            if (right < left) throw new InvalidOperationException("No NexaDesk artwork found.");

            // The first gap between occupied columns separates the icon from the wordmark.
            int gap = 0, iconRight = -1;
            for (int x = left; x <= right; x++) {
                gap = columns[x] ? 0 : gap + 1;
                if (gap == 16) { iconRight = x - gap; break; }
            }
            if (iconRight < left) throw new InvalidOperationException("Cannot isolate the icon.");
            var logoBounds = Rectangle.FromLTRB(left, top, right + 1, bottom + 1);
            using (var logo = PaddedCrop(cutout, logoBounds, 12, false)) {
                logo.Save(Path.Combine(outputDirectory, "nexadesk-logo.png"), ImageFormat.Png);
                Console.WriteLine("Horizontal logo: {0}x{1}", logo.Width, logo.Height);
            }

            int iconTop = source.Height, iconBottom = -1;
            for (int y = top; y <= bottom; y++) {
                for (int x = left; x <= iconRight; x++) {
                    if (cutout.GetPixel(x, y).A == 0) continue;
                    iconTop = Math.Min(iconTop, y); iconBottom = Math.Max(iconBottom, y);
                }
            }
            var iconBounds = Rectangle.FromLTRB(left, iconTop, iconRight + 1, iconBottom + 1);
            using (var icon = PaddedCrop(cutout, iconBounds, 16, true)) {
                icon.Save(Path.Combine(outputDirectory, "nexadesk-icon.png"), ImageFormat.Png);
                SaveSize(icon, 32, Path.Combine(outputDirectory, "favicon-32.png"));
                SaveSize(icon, 64, Path.Combine(outputDirectory, "favicon-64.png"));
                SaveSize(icon, 180, Path.Combine(outputDirectory, "apple-touch-icon.png"));
                Console.WriteLine("Standalone icon: {0}x{1}", icon.Width, icon.Height);
            }
        }
    }

    private static Color UnmatteEdge(Bitmap source, int x, int y, Color pixel) {
        // Interior brand colors are dark in the red channel. At antialiased
        // boundaries the neutral matte lifts all channels: recover coverage from
        // a neighboring interior color rather than retain a white/gray fringe.
        if (pixel.R < 50) return pixel;
        for (int radius = 1; radius <= 4; radius++) {
            for (int dy = -radius; dy <= radius; dy++) {
                for (int dx = -radius; dx <= radius; dx++) {
                    if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != radius) continue;
                    int nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= source.Width || ny >= source.Height) continue;
                    Color foreground = source.GetPixel(nx, ny);
                    if (foreground.R >= 45 || foreground.B < foreground.R + 25) continue;
                    double coverage = Math.Min(1, (double)(pixel.B - pixel.R) / (foreground.B - foreground.R));
                    return Color.FromArgb((int)Math.Round(255 * coverage), foreground.R, foreground.G, foreground.B);
                }
            }
        }
        return pixel;
    }

    private static Bitmap PaddedCrop(Bitmap source, Rectangle bounds, int padding, bool square) {
        int width = bounds.Width + padding * 2, height = bounds.Height + padding * 2;
        if (square) width = height = Math.Max(width, height);
        var target = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(target)) {
            graphics.CompositingMode = CompositingMode.SourceCopy;
            // No resampling: copy the original colored pixels at their native size.
            graphics.DrawImage(source, new Rectangle((width - bounds.Width) / 2, (height - bounds.Height) / 2, bounds.Width, bounds.Height), bounds, GraphicsUnit.Pixel);
        }
        return target;
    }

    private static void SaveSize(Bitmap source, int size, string path) {
        using (var target = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(target)) {
            graphics.CompositingMode = CompositingMode.SourceCopy;
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.DrawImage(source, new Rectangle(0, 0, size, size));
            target.Save(path, ImageFormat.Png);
        }
    }
}
'@

[NexaDeskBrandAssets]::Extract((Resolve-Path -LiteralPath $Source).Path, [System.IO.Path]::GetFullPath($Destination))
