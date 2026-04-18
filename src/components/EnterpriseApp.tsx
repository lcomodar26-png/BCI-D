import React, { useState, useEffect } from 'react';
import { 
  auth, db 
} from '../lib/firebase';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, 
  addDoc, serverTimestamp, onSnapshot, orderBy, limit, runTransaction
} from 'firebase/firestore';
import { 
  LayoutDashboard, Wallet, TrendingUp, Users, ShieldAlert, 
  History, LogOut, Search, ShieldCheck, Lock, Unlock, 
  AlertCircle, ArrowUpRight, ArrowDownRight, CreditCard
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  balance: number;
  blocked: boolean;
  createdAt: any;
}

interface Transaction {
  id: string;
  userId: string;
  type: 'deposit' | 'invest' | 'withdraw';
  amount: number;
  date: any;
}

// --- Components ---

const Button = ({ 
  children, onClick, variant = 'primary', className, disabled, type = 'button' 
}: { 
  children: React.ReactNode, onClick?: () => void, variant?: 'primary' | 'secondary' | 'danger' | 'outline', 
  className?: string, disabled?: boolean, type?: 'button' | 'submit'
}) => {
  const variants = {
    primary: 'bg-[#3b82f6] text-white hover:bg-blue-600',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    danger: 'bg-[#ef4444] text-white hover:bg-red-600',
    outline: 'border border-slate-200 text-slate-600 hover:bg-slate-50'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, title, subtitle, footer }: { children: React.ReactNode, className?: string, title?: string, subtitle?: string, footer?: React.ReactNode }) => (
  <div className={cn('bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm', className)}>
    {(title || subtitle) && (
      <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-white">
        <div>
          {title && <h3 className="text-[15px] font-semibold text-slate-800 tracking-tight">{title}</h3>}
          {subtitle && <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {footer}
      </div>
    )}
    <div className="p-5 flex-1">
      {children}
    </div>
  </div>
);

const TransactionItem = ({ tx }: { tx: Transaction }) => {
  const isPositive = tx.type === 'deposit' || tx.type === 'invest';
  const typeMap = {
    'deposit': 'Depósito',
    'invest': 'Investimento',
    'withdraw': 'Levantamento'
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0",
        tx.type === 'deposit' ? "bg-emerald-100 text-emerald-600" :
        tx.type === 'invest' ? "bg-blue-100 text-blue-600" : "bg-red-100 text-red-600"
      )}>
        {tx.type === 'deposit' ? '+' : tx.type === 'invest' ? 'I' : 'W'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 text-[13px]">{typeMap[tx.type] || tx.type}</p>
        <p className="text-[11px] text-slate-500 truncate">
          {tx.date?.toDate ? tx.date.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pendente...'} • Atividade da Plataforma
        </p>
      </div>
      <p className={cn(
        "font-semibold text-sm",
        isPositive ? "text-emerald-600" : "text-slate-800"
      )}>
        {isPositive ? '+' : '-'}${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
      </p>
    </div>
  );
};

export default function EnterpriseApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  
  // UI State
  const [amount, setAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin'>('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync Profile
        const profileRef = doc(db, 'users', u.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (!profileSnap.exists()) {
          const newProfile: UserProfile = {
            uid: u.uid,
            name: u.displayName || 'Utilizador Enterprise',
            email: u.email || '',
            role: 'user',
            balance: 0,
            blocked: false,
            createdAt: serverTimestamp()
          };
          await setDoc(profileRef, newProfile);
          setProfile(newProfile);
        } else {
          setProfile(profileSnap.data() as UserProfile);
        }

        // Check Admin Status
        const adminRef = doc(db, 'admins', u.uid);
        const adminSnap = await getDoc(adminRef);
        setIsAdminUser(adminSnap.exists());

        // Listen for profile changes
        onSnapshot(profileRef, (doc) => {
          setProfile(doc.data() as UserProfile);
        });

        // Listen for user transactions
        const txQuery = query(
          collection(db, 'transactions'),
          where('userId', '==', u.uid),
          orderBy('date', 'desc'),
          limit(10)
        );
        onSnapshot(txQuery, (snap) => {
          setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
        });
      } else {
        setProfile(null);
        setIsAdminUser(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Admin Data Subscription
  useEffect(() => {
    if (isAdminUser && activeTab === 'admin') {
      const usersUnsub = onSnapshot(collection(db, 'users'), (snap) => {
        setAllUsers(snap.docs.map(d => ({ ...d.data() } as UserProfile)));
      });
      const allTxUnsub = onSnapshot(query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(50)), (snap) => {
        setAllTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      });
      return () => {
        usersUnsub();
        allTxUnsub();
      };
    }
  }, [isAdminUser, activeTab]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error(err);
      alert("Falha no login. Por favor, verifique as permissões de pop-up do navegador.");
    }
  };

  const handleAction = async (type: 'deposit' | 'invest') => {
    if (!profile || !amount || Number(amount) <= 0) return;
    if (profile.blocked) {
      alert("A sua conta está bloqueada.");
      return;
    }

    setIsProcessing(true);
    const numAmount = Number(amount);

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', profile.uid);
        const userSnap = await tx.get(userRef);
        const data = userSnap.data() as UserProfile;

        if (type === 'invest' && data.balance < numAmount) {
          throw new Error("Saldo insuficiente");
        }

        let newBalance = data.balance;
        let finalAmount = numAmount;

        if (type === 'deposit') {
          newBalance += numAmount;
        } else if (type === 'invest') {
          const profit = numAmount * 0.15;
          newBalance += profit;
          finalAmount = profit; 
        }

        tx.update(userRef, { 
          balance: newBalance,
          updatedAt: serverTimestamp()
        });

        const txRef = doc(collection(db, 'transactions'));
        tx.set(txRef, {
          userId: profile.uid,
          type,
          amount: finalAmount,
          date: serverTimestamp()
        });
      });
      setAmount('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleBlockUser = async (targetUid: string, currentlyBlocked: boolean) => {
    if (!isAdminUser) return;
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        blocked: !currentlyBlocked,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f1f5f9]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3b82f6]"></div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
        <div className="w-16 h-16 bg-[#3b82f6] rounded-xl flex items-center justify-center mx-auto mb-6">
          <div className="w-8 h-8 rounded bg-white/20" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">Sistema Enterprise</h1>
        <p className="text-slate-500 mb-8 text-sm">Inicie sessão para aceder ao seu painel de investimento e gerir capital.</p>
        <Button onClick={handleLogin} className="w-full py-3 h-12">
          Entrar com Google
        </Button>
      </div>
    </div>
  );

  if (profile?.blocked) return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-8 shadow-sm text-center">
        <ShieldAlert className="text-[#ef4444] mx-auto mb-4" size={48} />
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Acesso Root Negado</h1>
        <p className="text-slate-500 mt-2 mb-6 text-sm">Um administrador suspendeu as credenciais da sua conta.</p>
        <Button onClick={() => signOut(auth)} variant="outline" className="w-full">
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col md:flex-row font-sans text-slate-800">
      {/* Sidebar - Sleek Theme */}
      <aside className="w-full md:w-[240px] bg-[#0f172a] text-white flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 bg-[#3b82f6] rounded-md shrink-0" />
            <span className="font-bold text-xl tracking-tighter">ENT-SYS</span>
          </div>
          
          <nav className="space-y-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                activeTab === 'dashboard' ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              <LayoutDashboard size={18} /> Painel de Controlo
            </button>
            {isAdminUser && (
              <button 
                onClick={() => setActiveTab('admin')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all md:mt-1",
                  activeTab === 'admin' ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-white"
                )}
              >
                <Users size={18} /> Gestão de Utilizadores
              </button>
            )}
            <div className="pt-4 mt-4 border-t border-white/5 space-y-1">
              <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Sistema</div>
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-slate-400 hover:text-white">
                <History size={18} /> Transações
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-slate-400 hover:text-white">
                <TrendingUp size={18} /> Pools de Investimento
              </button>
            </div>
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <img src={user.photoURL || ''} alt="" className="w-9 h-9 rounded-full border-2 border-slate-700 bg-slate-800" />
            <div className="flex-1 overflow-hidden">
              <p className="text-[13px] font-bold truncate leading-none mb-1">{profile?.name}</p>
              <p className="text-[11px] text-slate-400 truncate uppercase mt-1 tracking-wider font-semibold">
                {profile?.role === 'admin' ? 'Acesso Root' : 'Acesso de Utilizador'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={14} /> Sair do Sistema
          </button>
        </div>
      </aside>

      {/* Main Content - Sleek Theme */}
      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#f1f5f9]/80 backdrop-blur-md px-8 py-6 flex justify-between items-center border-b border-slate-200/50">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            {activeTab === 'dashboard' ? 'Painel de Controlo' : 'Gestão de Utilizadores'}
          </h1>
          <div className="flex items-center gap-4">
             <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-semibold">{profile?.name}</span>
                <span className="text-xs text-slate-500">{isAdminUser ? 'Portal de Administração' : 'Portal de Membro'}</span>
             </div>
             <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300" />
          </div>
        </div>

        <div className="p-8 space-y-6 flex-1 min-h-0">
          
          {activeTab === 'dashboard' ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Stats Grid - Sleek Theme */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-2">Capital Total</p>
                  <p className="text-2xl font-bold text-slate-800 leading-none">
                    ${profile?.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-2">Utilizadores Ativos</p>
                  <p className="text-2xl font-bold text-slate-800 leading-none">4,822</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-2">Lucro da Plataforma (15%)</p>
                  <p className="text-2xl font-bold text-slate-800 leading-none">$187,258.00</p>
                </div>
              </div>

              {/* Data Container with Grid Layout from Design */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* User Activity / Personal History */}
                <Card 
                  className="lg:col-span-3 min-h-[400px]" 
                  title="Atividade Recente" 
                  subtitle="Últimas atividades da sua conta"
                  footer={<span className="text-[11px] text-[#3b82f6] font-bold cursor-pointer hover:underline uppercase tracking-wide">Ver Registos Gerais</span>}
                >
                  <div className="-mx-5 -mt-2">
                    {transactions.length > 0 ? (
                      transactions.map(tx => (
                        <div key={tx.id}>
                          <TransactionItem tx={tx} />
                        </div>
                      ))
                    ) : (
                      <div className="py-20 text-center">
                        <History className="text-slate-200 mx-auto mb-3" size={40} />
                        <p className="text-slate-400 text-xs">Nenhum registo de atividade encontrado.</p>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Fund Management Panel */}
                <Card className="lg:col-span-2" title="Gestão de Fundos" subtitle="Execute depósitos instantâneos ou investimentos de crescimento">
                  <div className="space-y-5 py-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Montante de Capital</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                        <input 
                          type="number" 
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0,000"
                          className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3b82f6] focus:border-[#3b82f6] outline-none transition-all font-mono text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Button onClick={() => handleAction('deposit')} disabled={isProcessing} className="w-full h-11">
                        <ArrowUpRight size={16} /> Depósito Direto
                      </Button>
                      <Button onClick={() => handleAction('invest')} variant="secondary" disabled={isProcessing} className="w-full h-11 border border-slate-200 shadow-sm bg-white">
                        <TrendingUp size={16} className="text-[#3b82f6]" /> Aumentar Capital (15%)
                      </Button>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100">
                       <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-slate-500">APY do Sistema</span>
                          <span className="text-xs font-bold text-emerald-600">15.00%</span>
                       </div>
                       <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: '65%' }}
                            className="bg-[#3b82f6] h-full"
                          />
                       </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Markets Chart Card */}
              <Card title="Volatilidade do Sistema" subtitle="Fluxo de ativos em toda a plataforma e movimento de capital" className="mt-2">
                <div className="h-[240px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={transactions.map((t, i) => ({ name: i, val: t.amount })).reverse()}>
                      <defs>
                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" hide />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', shadow: 'none', fontSize: '11px' }}
                      />
                      <Area type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Admin Stats from Design */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-2">Utilizadores Geridos</p>
                  <p className="text-2xl font-bold text-slate-800 leading-none">{allUsers.length}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-2">Total de Entradas no Sistema</p>
                  <p className="text-2xl font-bold text-slate-800 leading-none">{allTransactions.length}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-2">Saldo Total Gerido</p>
                  <p className="text-2xl font-bold text-slate-800 leading-none">
                    ${allUsers.reduce((acc, u) => acc + u.balance, 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* User Table - Sleek Theme */}
                <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                  <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-white">
                    <h3 className="text-[15px] font-semibold text-slate-800 tracking-tight">Diretório de Utilizadores</h3>
                    <span className="text-[11px] text-[#3b82f6] font-bold cursor-pointer hover:underline uppercase">Exportar CSV</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                        <tr>
                          <th className="px-5 py-3.5">Utilizador</th>
                          <th className="px-5 py-3.5">Estado</th>
                          <th className="px-5 py-3.5">Saldo</th>
                          <th className="px-5 py-3.5">Cargo</th>
                          <th className="px-5 py-3.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map(u => (
                          <tr key={u.uid} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-slate-800">{u.name}</p>
                              <p className="text-[11px] text-slate-400">{u.email}</p>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={cn(
                                "text-[11px] font-bold uppercase px-2 py-0.5 rounded",
                                u.blocked ? "bg-red-100 text-[#991b1b]" : "bg-emerald-100 text-[#166534]"
                              )}>
                                {u.blocked ? 'Bloqueado' : 'Ativo'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 font-mono text-slate-600 font-medium">${u.balance.toLocaleString()}</td>
                            <td className="px-5 py-3.5 capitalize text-slate-500">{u.role === 'admin' ? 'Administrador' : 'Utilizador'}</td>
                            <td className="px-5 py-3.5 text-right">
                              <button 
                                onClick={() => toggleBlockUser(u.uid, u.blocked)}
                                className={cn(
                                  "text-[11px] font-semibold border px-3 py-1 rounded transition-all",
                                  u.blocked ? "border-slate-300 text-slate-500 hover:bg-slate-50" : "border-[#ef4444] text-[#ef4444] hover:bg-red-50"
                                )}
                                disabled={u.uid === profile?.uid}
                              >
                                {u.blocked ? 'Desbloquear Conta' : 'Suspender Conta'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* All Transactions Panel */}
                <Card className="lg:col-span-2" title="Atividade Global do Sistema" subtitle="Auditoria em tempo real das entradas na plataforma">
                  <div className="-mx-5 -mt-2 max-h-[600px] overflow-y-auto">
                    {allTransactions.map(tx => (
                      <div key={tx.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0",
                          tx.type === 'deposit' ? "bg-emerald-100 text-emerald-600" :
                          tx.type === 'invest' ? "bg-blue-100 text-blue-600" : "bg-red-100 text-red-600"
                        )}>
                          {tx.type === 'deposit' ? '+' : tx.type === 'invest' ? 'I' : 'W'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-[12px] truncate capitalize">
                            {tx.type === 'deposit' ? 'Depósito' : tx.type === 'invest' ? 'Investimento' : 'Levantamento'} • {allUsers.find(au => au.uid === tx.userId)?.name.split(' ')[0] || 'Utilizador'}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {tx.date?.toDate ? tx.date.toDate().toLocaleTimeString() : '...'}
                          </p>
                        </div>
                        <p className={cn(
                          "font-bold text-xs",
                          tx.type === 'deposit' || tx.type === 'invest' ? "text-emerald-600" : "text-slate-800"
                        )}>
                          ${tx.amount.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

        </div>
      </main>
    </div>
  );
}
