const filename = '{{FILENAME}}';
const expected = '{{SHA256}}';
const button = document.getElementById('download');
const status = document.getElementById('status');

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Downloading installer…';
  try {
    const parts = await Promise.all(Array.from({length: Number('{{PARTS}}')}, async (_, index) => {
      const response = await fetch('/downloads/' + filename + '.part' + (index + 1));
      if (!response.ok) throw new Error('Installer part unavailable');
      return response.arrayBuffer();
    }));
    const installer = new Blob(parts, {type: 'application/octet-stream'});
    if (installer.size !== Number('{{BYTES}}')) throw new Error('Installer size mismatch');
    status.textContent = 'Verifying checksum…';
    const hash = await crypto.subtle.digest('SHA-256', await installer.arrayBuffer());
    const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== expected) throw new Error('Installer checksum mismatch');
    const url = URL.createObjectURL(installer);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = 'Checksum verified. Check your browser’s Downloads.';
  } catch {
    status.textContent = 'The installer could not be downloaded or verified. Try again.';
  } finally {
    button.disabled = false;
  }
});
