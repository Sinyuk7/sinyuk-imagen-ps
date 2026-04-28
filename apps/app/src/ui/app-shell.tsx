import type { PluginHostShell } from "../host/create-plugin-host-shell";

export interface AppShellProps {
  readonly host: PluginHostShell;
}

export function AppShell({ host }: AppShellProps) {
  return (
    <section data-host={host.kind} data-stage={host.app.stage}>
      <h1>Imagen PS</h1>
      <p>Early-stage Photoshop plugin shell.</p>
      <ul>
        {host.app.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
