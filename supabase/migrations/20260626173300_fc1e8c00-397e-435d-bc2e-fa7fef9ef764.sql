
-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  user_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_user_code_key ON public.profiles(user_code);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "authenticated users can look up profiles by code" ON public.profiles FOR SELECT TO authenticated USING (true);

-- auto-create profile on signup with unique user_code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_code text;
  tries int := 0;
BEGIN
  LOOP
    new_code := upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_code = new_code);
    tries := tries + 1;
    IF tries > 5 THEN
      new_code := upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 12));
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (id, email, display_name, user_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    new_code
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

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

-- shared_messages
CREATE TABLE public.shared_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_code text,
  algorithm text NOT NULL,
  payload_b64 text NOT NULL,
  file_name text,
  file_mime text,
  is_file boolean NOT NULL DEFAULT false,
  hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz
);
CREATE INDEX shared_messages_code_idx ON public.shared_messages(code);
CREATE INDEX shared_messages_sender_idx ON public.shared_messages(sender_id);
CREATE INDEX shared_messages_recipient_id_idx ON public.shared_messages(recipient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_messages TO authenticated;
GRANT ALL ON public.shared_messages TO service_role;
ALTER TABLE public.shared_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "senders manage own shares" ON public.shared_messages FOR ALL TO authenticated
  USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "sender or recipient can read" ON public.shared_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "recipient can mark opened" ON public.shared_messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);
