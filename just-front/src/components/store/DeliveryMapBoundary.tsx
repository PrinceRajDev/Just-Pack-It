import { Component, type ReactNode } from "react";

/** A failed optional map download must not take the address form down. */
export class DeliveryMapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p role="alert" className="text-sm">
        Map unavailable. Your address and pin are kept. Use GPS or the coordinate fields, or hide
        and reopen the map to retry.
      </p>
    ) : (
      this.props.children
    );
  }
}
