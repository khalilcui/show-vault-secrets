
-- 1) Add a short, shareable user code to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_code text;

-- Backfill any existing rows
UPDATE public.profiles
SET user_code = upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 8))
WHERE user_code IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN user_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_code_key ON public.profiles(user_code);

-- 2) Update new-user trigger to generate the code automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
END;
$function$;

-- Make sure the auth trigger is wired (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) Allow signed-in users to look up another user's code → id (needed for "send to user ABC123")
DROP POLICY IF EXISTS "authenticated users can look up profiles by code" ON public.profiles;
CREATE POLICY "authenticated users can look up profiles by code"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 4) Direct addressing on shared_messages
ALTER TABLE public.shared_messages
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recipient_code text;

CREATE INDEX IF NOT EXISTS shared_messages_recipient_id_idx ON public.shared_messages(recipient_id);

-- 5) Replace the wide-open "anyone can read by code" policy with sender-or-recipient access
DROP POLICY IF EXISTS "anyone can read by code" ON public.shared_messages;
DROP POLICY IF EXISTS "sender or recipient can read" ON public.shared_messages;
CREATE POLICY "sender or recipient can read"
ON public.shared_messages
FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Recipient can mark a message as opened (update opened_at)
DROP POLICY IF EXISTS "recipient can mark opened" ON public.shared_messages;
CREATE POLICY "recipient can mark opened"
ON public.shared_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

-- Drop anon read access entirely (was only needed for public link sharing)
REVOKE SELECT ON public.shared_messages FROM anon;
