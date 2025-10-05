export async function readJson<T = any>(input: Request | Response): Promise<T> {
  return (await input.json()) as T;
}
