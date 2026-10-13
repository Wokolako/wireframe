// Publishable keys are public identifiers. Secret keys stay exclusively in .env/server code.
// This development-instance fallback keeps static presentation deployments usable.
export const clerkPublishableKey=import.meta.env.VITE_CLERK_PUBLISHABLE_KEY||'pk_test_ZHluYW1pYy1wZWFjb2NrLTkxODYuY2xlcmsuYWNjb3VudHMuZGV2JA';
export const adminEmail='georgechivalo01@gmail.com';
