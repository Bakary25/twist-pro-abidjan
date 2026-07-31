// ============================================
// TWIST PRO ABIDJAN — Config Supabase
// ============================================
// Remplace ces deux valeurs par celles de ton projet
// Supabase (Project Settings > API)

const SUPABASE_URL = "https://veauampmspfuotlnpsep.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlYXVhbXBtc3BmdW90bG5wc2VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNTgxNTEsImV4cCI6MjEwMDkzNDE1MX0.V6-pyoQe5eSQBdDoA4eyO-1uEJWfmKQ1tPvk8mwMGho";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Numéro WhatsApp du vendeur (format international, sans le +, sans espaces)
const WHATSAPP_NUMBER = "2250778993255";
