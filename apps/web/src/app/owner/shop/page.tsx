import type { Metadata } from 'next';
import Link from 'next/link';
import { shopItemEffectValues } from '@ririko/core';
import { OwnerNav } from '@/components/owner-nav';
import { ActionButtonForm, SettingsForm, TextField } from '@/components/settings-form';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { createShopCategory, deleteShopCategory, updateShopCategory } from './actions';

export const metadata: Metadata = { title: 'Item Shop · Owner Console · Ririko Dashboard' };

export default async function OwnerShopPage() {
  await requireOwner('/owner/shop');
  const { itemCatalog } = await getWebServices();
  const [items, categories] = await Promise.all([
    itemCatalog.listItems(),
    itemCatalog.listCategories(),
  ]);

  return (
    <section className="flex flex-col gap-8">
      <OwnerNav current="/owner/shop" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Item shop</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            The items members buy with /shop and use with /use, on every server. Items members hold
            can be retired (no longer sold) but not deleted.
          </p>
        </div>
        <Link
          href="/owner/shop/new"
          className="rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura"
        >
          New item
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">The shop has no items yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-edge text-xs text-zinc-400 uppercase">
              <tr>
                <th className="py-2 pr-4 font-medium">Item</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 text-right font-medium">Price</th>
                <th className="py-2 pr-4 font-medium">Effect</th>
                <th className="py-2 pr-4 text-right font-medium">Holders</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ item, categoryName, holders }) => (
                <tr key={item.id} className="border-b border-edge/60">
                  <td className="py-2 pr-4">
                    <Link href={`/owner/shop/${item.id}`} className="font-medium hover:text-sakura">
                      {item.name}
                    </Link>
                    <p className="font-mono text-xs text-zinc-500">{item.code ?? 'no code'}</p>
                  </td>
                  <td className="py-2 pr-4 text-zinc-300">{categoryName ?? '—'}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {Number(item.price).toLocaleString('en-US')}
                  </td>
                  <td className="py-2 pr-4 text-zinc-300">
                    {shopItemEffectValues(item.metadata).itemType}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{holders}</td>
                  <td className="py-2">
                    {item.isPurchasable ? (
                      <span className="text-emerald-300">On sale</span>
                    ) : (
                      <span className="text-zinc-400">Retired</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Categories</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-zinc-400">No categories yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {categories.map(({ category, items: count, seeded }) => (
              <li key={category.id} className="rounded-lg border border-edge p-4">
                <p className="mb-3 text-xs text-zinc-400">
                  Code <span className="font-mono">{category.code ?? 'none'}</span> ·{' '}
                  {count === 1 ? '1 item' : `${count} items`}
                </p>
                <SettingsForm
                  action={updateShopCategory.bind(null, category.id)}
                  submitLabel="Save category"
                >
                  {category.code === null ? (
                    <TextField name="code" label="Code" maxLength={32} defaultValue="" />
                  ) : null}
                  <TextField name="name" label="Name" maxLength={64} defaultValue={category.name} />
                  <TextField
                    name="description"
                    label="Description"
                    maxLength={200}
                    defaultValue={category.description ?? ''}
                  />
                </SettingsForm>
                {count === 0 && !seeded ? (
                  <div className="mt-3">
                    <ActionButtonForm
                      action={deleteShopCategory}
                      fields={{ categoryId: category.id }}
                      label="Delete category"
                      confirmMessage={`Delete the ${category.name} category?`}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-lg border border-dashed border-edge p-4">
          <h3 className="mb-3 text-sm font-semibold">Add a category</h3>
          <SettingsForm action={createShopCategory} submitLabel="Add category">
            <TextField
              name="code"
              label="Code"
              description="2 to 32 lowercase letters, digits or underscores. It cannot change later."
              maxLength={32}
              defaultValue=""
            />
            <TextField name="name" label="Name" maxLength={64} defaultValue="" />
            <TextField name="description" label="Description" maxLength={200} defaultValue="" />
          </SettingsForm>
        </div>
      </section>
    </section>
  );
}
