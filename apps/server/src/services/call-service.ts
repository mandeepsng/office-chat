/**
 * Tracks which users are currently ringing/in a 1:1 call so the server can
 * reject a second invite as busy. Purely in-memory — a call is never
 * persisted, and this resets on server restart along with all connections.
 */
export class CallService {
  private readonly peerByUser = new Map<string, string>();

  isBusy(userId: string): boolean {
    return this.peerByUser.has(userId);
  }

  peerOf(userId: string): string | undefined {
    return this.peerByUser.get(userId);
  }

  /** Reserve both users for a call. Callers must check `isBusy` first. */
  start(fromUserId: string, toUserId: string): void {
    this.peerByUser.set(fromUserId, toUserId);
    this.peerByUser.set(toUserId, fromUserId);
  }

  /** Clear this user's call state and their peer's. Returns the peer, if any. */
  end(userId: string): string | undefined {
    const peer = this.peerByUser.get(userId);
    this.peerByUser.delete(userId);
    if (peer) this.peerByUser.delete(peer);
    return peer;
  }
}
