/** Mirrors the editor's structure while browser-saved drafts are restored. */
export default function WorkspaceLoading() {
  return (
    <main className="workspace-loading">
      <header className="workspace-loading__topbar" aria-hidden="true">
        <div className="workspace-loading__brand">
          <img src={encodeURI('/MEAWHOOK ICON WHITE.svg')} alt="" />
          <img src={encodeURI('/MEAWHOOK WHITE LETTER.svg')} alt="" />
        </div>
        <div className="workspace-loading__nav">
          <span className="workspace-loading__line" />
          <span className="workspace-loading__line" />
          <span className="workspace-loading__line" />
          <span className="workspace-loading__line" />
        </div>
      </header>

      <div className="workspace-loading__body">
        <aside className="workspace-loading__sidebar" aria-hidden="true">
          <div className="workspace-loading__sidebar-head">
            <span className="workspace-loading__line workspace-loading__line--label" />
            <span className="workspace-loading__line workspace-loading__line--short" />
          </div>
          <div className="workspace-loading__draft-row" />
          <div className="workspace-loading__sidebar-tools">
            <span /><span /><span />
            <span /><span /><span />
          </div>
        </aside>

        <div className="workspace-loading__panes">
          <section className="workspace-loading__editor" aria-label="Editor loading">
            <div className="workspace-loading__pane-head" aria-hidden="true">
              <span className="workspace-loading__line workspace-loading__line--title" />
              <span className="workspace-loading__line workspace-loading__line--meta" />
            </div>
            <div className="workspace-loading__editor-body">
              <div className="workspace-loading__status" role="status" aria-live="polite">
                <span className="workspace-loading__spinner" aria-hidden="true" />
                <div>
                  <strong>Opening your workspace</strong>
                  <span>Getting your drafts ready…</span>
                </div>
              </div>
              <div className="workspace-loading__field" aria-hidden="true">
                <span className="workspace-loading__line workspace-loading__line--label" />
                <span className="workspace-loading__input" />
              </div>
              <div className="workspace-loading__message" aria-hidden="true">
                <span className="workspace-loading__line workspace-loading__line--title" />
                <span className="workspace-loading__line workspace-loading__line--wide" />
                <span className="workspace-loading__input workspace-loading__input--tall" />
                <span className="workspace-loading__line workspace-loading__line--wide" />
                <span className="workspace-loading__line workspace-loading__line--medium" />
              </div>
            </div>
          </section>

          <section className="workspace-loading__preview" aria-label="Preview loading" aria-hidden="true">
            <div className="workspace-loading__pane-head">
              <span className="workspace-loading__line workspace-loading__line--title" />
            </div>
            <div className="workspace-loading__preview-body">
              <div className="workspace-loading__preview-card">
                <span className="workspace-loading__line workspace-loading__line--medium" />
                <div className="workspace-loading__preview-message">
                  <span className="workspace-loading__avatar" />
                  <div>
                    <span className="workspace-loading__line workspace-loading__line--medium" />
                    <span className="workspace-loading__line workspace-loading__line--wide" />
                    <span className="workspace-loading__line workspace-loading__line--short" />
                    <span className="workspace-loading__embed" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
