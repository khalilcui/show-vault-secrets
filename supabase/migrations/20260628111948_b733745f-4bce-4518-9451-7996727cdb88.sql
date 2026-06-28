
CREATE OR REPLACE FUNCTION public.find_profile_by_code(_code text)
RETURNS TABLE(id uuid, user_code text, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.user_code, p.display_name
  FROM public.profiles p
  WHERE p.user_code = upper(_code)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_profile_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_profile_by_code(text) TO authenticated;
