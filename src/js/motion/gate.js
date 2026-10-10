/**
 * The page gate. Reveals wait on it so nothing animates underneath the page veil: the transition
 * opens the gate the moment the veil starts lifting, and reveals begin as the panels clear.
 */
let open;
export const gate = new Promise((resolve) => { open = resolve; });
export const openGate = () => open();
