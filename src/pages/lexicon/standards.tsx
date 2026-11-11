import Layout from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import TranslationWorkspace from '@/features/lexicon/translation/TranslationWorkspace';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function StandardsTranslationPage() {
  const { user, isLoading } = useRequireAuth();
  return (
    <Layout title="Standards-first translation | FireBIM">
      {isLoading || !user ? (
        <LoadingSpinner />
      ) : (
        <TranslationWorkspace key={user.id} userId={user.id} />
      )}
    </Layout>
  );
}
