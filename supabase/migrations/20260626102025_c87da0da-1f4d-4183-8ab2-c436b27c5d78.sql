
-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- signup_otps (server-only)
CREATE TABLE public.signup_otps (
  email text PRIMARY KEY,
  code_hash text NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.signup_otps TO service_role;
ALTER TABLE public.signup_otps ENABLE ROW LEVEL SECURITY;
-- no policies => only service_role (which bypasses RLS) can touch this

-- shared_messages
CREATE TABLE public.shared_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  algorithm text NOT NULL,
  payload_b64 text NOT NULL,            -- ciphertext (base64)
  file_name text,
  file_mime text,
  is_file boolean NOT NULL DEFAULT false,
  hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz
);
CREATE INDEX shared_messages_code_idx ON public.shared_messages(code);
CREATE INDEX shared_messages_sender_idx ON public.shared_messages(sender_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_messages TO authenticated;
GRANT SELECT, UPDATE ON public.shared_messages TO anon;     -- receiver may be logged out; reads by code, updates only opened_at via server fn
GRANT ALL ON public.shared_messages TO service_role;
ALTER TABLE public.shared_messages ENABLE ROW LEVEL SECURITY;
-- sender CRUD their own
CREATE POLICY "senders manage own shares" ON public.shared_messages FOR ALL TO authenticated
  USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
-- public read by code (only safe columns are projected by the API)
CREATE POLICY "anyone can read by code" ON public.shared_messages FOR SELECT TO anon, authenticated USING (true);
