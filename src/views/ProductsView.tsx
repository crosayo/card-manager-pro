'use client';

import React, { useState } from 'react';
import { Product } from '../types';
import { Menu, Plus, Edit3, Trash2, X, Save, Eye, EyeOff } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface ProductsViewProps {
  products: Product[];
}

export const ProductsView: React.FC<ProductsViewProps> = ({ products }) => {
  const { addProduct, updateProduct, deleteProduct, isAdmin } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    releaseDate: '',
    isSidebarVisible: true
  });

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      releaseDate: new Date().toISOString().split('T')[0],
      isSidebarVisible: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      releaseDate: product.releaseDate,
      isSidebarVisible: product.isSidebarVisible
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      await updateProduct(editingProduct.id, formData);
    } else {
      await addProduct(formData);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const sortedProducts = [...products].sort((a, b) => 
    new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
  );

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>管理者権限が必要です。</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-24">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Menu /> 製品マスタ管理
        </h2>
        <button 
          onClick={openAddModal}
          className="bg-cyan-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-cyan-700 flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} /> 新規製品追加
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm font-medium">
                <th className="p-4 w-32">発売日</th>
                <th className="p-4">製品名 (パック名)</th>
                <th className="p-4 w-24 text-center">表示</th>
                <th className="p-4 w-32 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedProducts.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono text-slate-600 text-sm">{p.releaseDate}</td>
                  <td className="p-4 font-bold text-slate-800">{p.name}</td>
                  <td className="p-4 text-center">
                    {p.isSidebarVisible ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold">
                        <Eye size={12} /> ON
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold">
                        <EyeOff size={12} /> OFF
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => openEditModal(p)}
                        className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded transition-colors"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(p.id, p.name)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">
                {editingProduct ? '製品情報を編集' : '新規製品登録'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">製品名 (正式名称)</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="例: ストラクチャーデッキ－青眼龍轟臨－"
                  disabled={!!editingProduct} // PKなので編集時は変更不可
                />
                {editingProduct && <p className="text-xs text-slate-400 mt-1">※製品名は変更できません</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">発売日</label>
                <input
                  type="date"
                  required
                  value={formData.releaseDate}
                  onChange={(e) => setFormData({...formData, releaseDate: e.target.value})}
                  className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isVisible"
                  checked={formData.isSidebarVisible}
                  onChange={(e) => setFormData({...formData, isSidebarVisible: e.target.checked})}
                  className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 border-gray-300"
                />
                <label htmlFor="isVisible" className="text-sm font-medium text-slate-700 cursor-pointer">
                  サイドバーに表示する
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-bold flex items-center gap-2"
                >
                  <Save size={18} /> 保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="製品削除"
        message={deleteTarget ? `「${deleteTarget.name}」を削除してもよろしいですか？\n紐づいているカードのカテゴリ情報は残りますが、サイドバー等から消えます。` : ''}
        variant="danger"
        confirmLabel="削除"
        onConfirm={() => {
          if (deleteTarget) deleteProduct(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};