export function WatchPartyPanel({
  activeSession,
  partyMembers,
  myParties,
  joinCodeInput,
  onJoinCodeChange,
  partyNameInput,
  onPartyNameChange,
  importOnJoin,
  onImportOnJoinChange,
  message,
  error,
  submitting,
  pendingUrlJoin,
  urlJoinCode,
  onCreate,
  onJoin,
  onLeave,
  onCopyLink,
  onSwitchParty,
}) {
  return (
    <section className="watch-party-panel">
      <div className="watch-party-header">
        <h3>Watch Party</h3>
        <p>Share one timeline with friends. Everyone sees the same progress.</p>
      </div>

      {pendingUrlJoin ? (
        <p className="watch-party-invite">
          Invite code <strong>{urlJoinCode}</strong> detected — sign in to join automatically.
        </p>
      ) : null}

      {activeSession ? (
        <div className="watch-party-active">
          <div className="watch-party-active-head">
            <p>
              <strong>{activeSession.name}</strong>
            </p>
            <p className="watch-party-code">
              Join code: <strong>{activeSession.joinCode}</strong>
            </p>
          </div>
          <div className="watch-party-actions">
            <button type="button" onClick={onCopyLink}>
              Copy invite link
            </button>
            <button type="button" onClick={onLeave} disabled={submitting}>
              {submitting ? "Leaving..." : "Leave party"}
            </button>
          </div>
          {partyMembers.length > 0 ? (
            <div className="watch-party-members">
              <h4>Members ({partyMembers.length})</h4>
              <ul>
                {partyMembers.map((member) => (
                  <li key={member.username}>
                    <span>@{member.username}</span>
                    <span>
                      {member.completedMarked} completed · {member.updates} updates
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="watch-party-forms">
          <label className="watch-party-import">
            <input
              type="checkbox"
              checked={importOnJoin}
              onChange={(e) => onImportOnJoinChange(e.target.checked)}
            />
            Import my current progress when creating or joining
          </label>
          <form onSubmit={onCreate} className="watch-party-form">
            <label htmlFor="watch-party-name">
              Party name
              <input
                id="watch-party-name"
                type="text"
                maxLength={80}
                value={partyNameInput}
                onChange={(e) => onPartyNameChange(e.target.value)}
                placeholder="MCU Watch Party"
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create watch party"}
            </button>
          </form>
          <form onSubmit={onJoin} className="watch-party-form">
            <label htmlFor="watch-party-join-code">
              Join code
              <input
                id="watch-party-join-code"
                type="text"
                maxLength={6}
                value={joinCodeInput}
                onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="ABC123"
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Joining..." : "Join watch party"}
            </button>
          </form>
        </div>
      )}

      {myParties.length > 0 ? (
        <div className="watch-party-list">
          <h4>Your watch parties</h4>
          <ul>
            {myParties.map((party) => {
              const isActive = activeSession?.sessionId === party.sessionId;
              return (
                <li key={party.sessionId} className={isActive ? "is-active" : ""}>
                  <div>
                    <strong>{party.name}</strong>
                    <span>{party.joinCode}</span>
                  </div>
                  <button
                    type="button"
                    disabled={submitting || isActive}
                    onClick={() => onSwitchParty(party)}
                  >
                    {isActive ? "Active" : "Open"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {message ? <p className="auth-success">{message}</p> : null}
      {error ? <p className="auth-error">{error}</p> : null}
    </section>
  );
}
