# Spring 社員管理システム 学習ガイド

Card Manager Pro の知識を活かして Spring 開発に挑む方向けのガイド

---

## 目次

1. すでに理解できている部分
2. 新たに理解が必要な部分（Spring固有）
3. 想定されるシステム構造
4. 必要なもの一覧
5. 学習ロードマップ

---

## 1. すでに理解できている部分

Card Manager Pro を通じて身についている知識です。
Spring開発でも**同じ考え方がそのまま使えます。**

---

### 1-1. データベース設計

```
【Card Manager Pro で学んだこと】

  items テーブル（カード在庫）
  ┌────────┬────────┬──────────────┐
  │ id(PK) │ name   │ category(FK) │  ← 主キー・外部キーの概念
  └────────┴────────┴──────────────┘
       ↑
  AUTO INCREMENT（自動採番）

  products テーブル（製品マスタ）
  ┌────────┬────────┬──────────────┐
  │ name   │ era    │ release_date │
  └────────┴────────┴──────────────┘

  関係: items.category = products.name（1対多）

【社員システムでも同じ考え方を使う】

  employees テーブル（社員）
  ┌────────┬────────┬─────────────────┐
  │ id(PK) │ name   │ department_id(FK)│  ← 全く同じ構造
  └────────┴────────┴─────────────────┘

  departments テーブル（部署マスタ）
  ┌────────┬────────────┐
  │ id(PK) │ name        │
  └────────┴────────────┘

  → 主キー・外部キー・1対多の関係はそのまま応用できる
```

---

### 1-2. CRUD操作の概念

```
Card Manager Pro の api.ts で書いていた操作

  api.fetchItems()    →  SELECT * FROM items
  api.addItem()       →  INSERT INTO items VALUES (...)
  api.updateItem()    →  UPDATE items SET ... WHERE id = ?
  api.deleteItem()    →  DELETE FROM items WHERE id = ?

社員システムでも全く同じSQL操作をする

  社員一覧取得  →  SELECT * FROM employees
  社員登録      →  INSERT INTO employees VALUES (...)
  社員情報更新  →  UPDATE employees SET ... WHERE id = ?
  社員削除      →  DELETE FROM employees WHERE id = ?

→ 「何をしたいか」の考え方は同じ。書き方（コード）が変わるだけ。
```

---

### 1-3. 画面→API→DB→画面 のデータフロー

```
Card Manager Pro で理解した流れ

  ユーザー操作
      │
      ▼
  画面コンポーネント（React）
      │
      ▼
  api.ts の関数を呼ぶ
      │
      ▼
  Supabase（DB）でSQL実行
      │
      ▼
  結果を画面に反映

Spring でも同じ流れ（名前が変わるだけ）

  ユーザー操作（フォーム送信）
      │
      ▼
  Controller（@Controller）  ← 受け口
      │
      ▼
  Service（@Service）        ← ビジネスロジック
      │
      ▼
  Repository（@Repository）  ← DB操作
      │
      ▼
  DB（Oracle/PostgreSQL）
      │
      ▼
  結果を画面（Thymeleaf）に反映
```

---

### 1-4. 検索・フィルタリング・ページネーション

```
Card Manager Pro での実装（概念）

  // 検索キーワードでフィルタ
  SELECT * FROM items WHERE name LIKE '%キーワード%'

  // ページネーション
  LIMIT 50 OFFSET 0   ← 1ページ目
  LIMIT 50 OFFSET 50  ← 2ページ目

社員システムでも同じ発想

  // 社員名で検索
  SELECT * FROM employees WHERE name LIKE '%山田%'

  // 部署でフィルタ
  SELECT * FROM employees WHERE department_id = 3

  // ページネーション（Spring Data JPAが自動でやってくれる）
  Pageable pageable = PageRequest.of(0, 20);
```

---

### 1-5. 認証・権限制御の概念

```
Card Manager Pro で学んだ概念

  isAdmin = true  → 編集・削除ができる
  isAdmin = false → 閲覧のみ

社員システムでも同じ考え方

  ROLE_ADMIN（人事部）  → 登録・編集・削除できる
  ROLE_USER（一般社員） → 自分の情報のみ閲覧できる
  未ログイン            → 何も見られない

→ 「権限によってできることを変える」考え方は同じ
```

---

### 1-6. バリデーション（入力チェック）の概念

```
Card Manager Pro での実装（概念）

  if (!name || !rare) {
    エラーメッセージを表示
    return;
  }

社員システムでも同じ発想（Springでは書き方が変わる）

  名前は必須
  メールアドレスは正しい形式か
  入社日は過去の日付か
  電話番号は数字のみか
```

---

## 2. 新たに理解が必要な部分（Spring固有）

Card Manager Pro にはない、Spring 特有の概念です。

---

### 2-1. アノテーション（@ で始まる印）

Spring では @ をつけるだけでさまざまな機能が有効になります。

```java
// 【@Controller】 この クラスが「画面の受け口」だと宣言する
// Card Manager Pro でいう app/page.tsx に相当
@Controller
public class EmployeeController {

    // 【@GetMapping】 GETリクエストを受け取るメソッド
    // Card Manager Pro でいう app/inventory/page.tsx に相当
    @GetMapping("/employees")
    public String list(Model model) {
        model.addAttribute("employees", employeeService.findAll());
        return "employees/list";  // templates/employees/list.html を表示
    }

    // 【@PostMapping】 フォームのPOSTを受け取るメソッド
    @PostMapping("/employees/add")
    public String add(@ModelAttribute Employee employee) {
        employeeService.save(employee);
        return "redirect:/employees";  // 一覧にリダイレクト
    }
}
```

```
主なアノテーション一覧

  @Controller        画面を返すコントローラー
  @RestController    JSONを返すAPIコントローラー（Card Manager ProのRoute.tsに相当）
  @Service           ビジネスロジックのクラス
  @Repository        DB操作のクラス
  @Entity            DBのテーブルと対応するクラス（Javaのデータ型定義）
  @Autowired         依存性注入（後述）
  @GetMapping        GETリクエストの受け口
  @PostMapping       POSTリクエストの受け口
  @PathVariable      URLの {id} 部分を取得
  @RequestParam      クエリパラメータを取得
  @ModelAttribute    フォームのデータをオブジェクトに変換
  @Transactional     DB操作をまとめてトランザクション管理
  @NotNull           バリデーション：null禁止
  @Size              バリデーション：文字数制限
```

---

### 2-2. DI（依存性注入）と @Autowired

Spring の最も重要な概念のひとつです。

```java
// 【DI なし（旧来の書き方）】
public class EmployeeController {
    // 自分でインスタンスを作る → テストしにくい・変更しにくい
    private EmployeeService service = new EmployeeService();
}

// 【DI あり（Springの書き方）】
@Controller
public class EmployeeController {

    // @Autowired → Springが自動でインスタンスを注入してくれる
    @Autowired
    private EmployeeService employeeService;

    // コントローラーは「使う」だけ。「作る」のはSpringの仕事
}
```

```
DIのイメージ図

  Spring コンテナ（管理箱）
  ┌──────────────────────────────┐
  │  EmployeeController          │
  │  EmployeeService        ─────┼──► 必要なときに自動で渡してくれる
  │  EmployeeRepository          │
  │  DataSource（DB接続）        │
  └──────────────────────────────┘

  Card Manager Pro でいうと AppContext（グローバル状態管理）に近い考え方
  「どこからでも必要なものを取り出せる」仕組み
```

---

### 2-3. Spring Data JPA（SQLを自動生成）

Card Manager Pro では SQL を自分で書いていましたが、
JPA を使うと SQL をほぼ書かずに済みます。

```java
// 【Card Manager Pro のやり方（SQL直書き）】
const { data } = await supabase
    .from('items')
    .select('*')
    .eq('id', id);

// 【Spring Data JPA のやり方（SQLを自動生成）】
@Repository
public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    // findAll() → SELECT * FROM employees  （自動生成）
    // findById(id) → SELECT * FROM employees WHERE id = ?  （自動生成）
    // save(emp) → INSERT または UPDATE  （自動生成）
    // deleteById(id) → DELETE FROM employees WHERE id = ?  （自動生成）

    // メソッド名でSQLを自動生成してくれる
    List<Employee> findByName(String name);
    // → SELECT * FROM employees WHERE name = ?

    List<Employee> findByDepartmentId(Long deptId);
    // → SELECT * FROM employees WHERE department_id = ?

    List<Employee> findByNameContaining(String keyword);
    // → SELECT * FROM employees WHERE name LIKE '%keyword%'
}
```

---

### 2-4. @Entity（テーブルとクラスの対応）

```java
// Card Manager Pro の types.ts での型定義
// type Item = { id: number; name: string; ... }

// Spring での型定義（@Entity をつけるとDBテーブルと自動で対応する）
@Entity
@Table(name = "employees")          // DBのテーブル名を指定
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)  // 自動採番
    private Long id;

    @Column(name = "name", nullable = false)  // NOT NULL
    @NotBlank(message = "名前は必須です")      // バリデーション
    private String name;

    @Column(name = "email", unique = true)    // ユニーク制約
    @Email(message = "メールアドレスの形式が正しくありません")
    private String email;

    @Column(name = "hire_date")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate hireDate;

    @ManyToOne                               // 多対1の関係（社員 → 部署）
    @JoinColumn(name = "department_id")      // 外部キー
    private Department department;

    // getter / setter（省略）
}
```

---

### 2-5. @Transactional（トランザクション管理）

```java
// 複数のDB操作をひとまとめにして「全部成功 or 全部失敗」にする

@Service
public class EmployeeService {

    @Transactional  // ← これをつけるだけでトランザクション管理される
    public void transferDepartment(Long empId, Long newDeptId) {
        // 1. 社員の部署を更新
        Employee emp = employeeRepository.findById(empId).orElseThrow();
        emp.setDepartmentId(newDeptId);
        employeeRepository.save(emp);

        // 2. 履歴を記録
        transferLogRepository.save(new TransferLog(empId, newDeptId));

        // ← ここで例外が発生したら、1も2も両方ロールバックされる
        //   Card Manager Proにはなかったが社員システムでは必要
    }
}
```

---

### 2-6. application.properties（設定ファイル）

```properties
# src/main/resources/application.properties

# DB接続設定（Card Manager Pro の .env.local に相当）
spring.datasource.url=jdbc:postgresql://localhost:5432/employee_db
spring.datasource.username=postgres
spring.datasource.password=password
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA設定
spring.jpa.hibernate.ddl-auto=update   # 起動時にテーブルを自動更新
spring.jpa.show-sql=true               # SQLをコンソールに表示（開発時）
spring.jpa.properties.hibernate.format_sql=true

# Thymeleafのキャッシュ無効化（開発時）
spring.thymeleaf.cache=false

# ポート番号
server.port=8080
```

---

### 2-7. Thymeleaf（HTMLテンプレートエンジン）

```html
<!-- Card Manager Pro のReact（JSX）での書き方 -->
{items.map(item => (
  <tr key={item.id}>
    <td>{item.name}</td>
    <td>{item.stock}</td>
  </tr>
))}

<!-- Thymeleafでの書き方（HTMLにそのまま書く） -->
<table>
  <tr th:each="emp : ${employees}">
    <td th:text="${emp.name}">山田太郎</td>
    <td th:text="${emp.department.name}">営業部</td>
  </tr>
</table>

<!-- フォームの書き方 -->
<form th:action="@{/employees/add}" th:object="${employee}" method="post">
  <input type="text" th:field="*{name}" placeholder="氏名"/>
  <span th:errors="*{name}" class="error"></span>  <!-- バリデーションエラー表示 -->
  <button type="submit">登録</button>
</form>
```

---

### 2-8. Spring Security（認証・権限管理）

```java
// Card Manager Pro では Supabase Auth が担当していた部分
// Spring では Spring Security で実装する

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/css/**").permitAll()  // 誰でもアクセス可
                .requestMatchers("/admin/**").hasRole("ADMIN")     // ADMINのみ
                .anyRequest().authenticated()                       // それ以外はログイン必須
            )
            .formLogin(form -> form
                .loginPage("/login")
                .defaultSuccessUrl("/employees")
            )
            .logout(logout -> logout
                .logoutSuccessUrl("/login")
            );
        return http.build();
    }
}
```

---

## 3. 想定されるシステム構造

---

### 3-1. 画面一覧

```
┌──────────────────────────────────────────────────────────────┐
│  URL                    │  画面名                  │  権限    │
├──────────────────────────────────────────────────────────────┤
│  GET  /login            │  ログイン画面             │  全員    │
│  GET  /employees        │  社員一覧                 │  要ログイン│
│  GET  /employees/{id}   │  社員詳細                 │  要ログイン│
│  GET  /employees/add    │  社員登録フォーム          │  管理者   │
│  POST /employees/add    │  社員登録実行              │  管理者   │
│  GET  /employees/{id}/edit│ 社員編集フォーム          │  管理者   │
│  POST /employees/{id}/edit│ 社員編集実行              │  管理者   │
│  POST /employees/{id}/delete│ 社員削除               │  管理者   │
│  GET  /departments      │  部署一覧                 │  管理者   │
└──────────────────────────────────────────────────────────────┘
```

---

### 3-2. ディレクトリ構造

```
employee-management/
├── src/
│   ├── main/
│   │   ├── java/com/example/employee/
│   │   │   │
│   │   │   ├── controller/           ← 画面の受け口（@Controller）
│   │   │   │   ├── EmployeeController.java
│   │   │   │   ├── DepartmentController.java
│   │   │   │   └── AuthController.java
│   │   │   │
│   │   │   ├── service/              ← ビジネスロジック（@Service）
│   │   │   │   ├── EmployeeService.java
│   │   │   │   └── DepartmentService.java
│   │   │   │
│   │   │   ├── repository/           ← DB操作（@Repository）
│   │   │   │   ├── EmployeeRepository.java
│   │   │   │   └── DepartmentRepository.java
│   │   │   │
│   │   │   ├── entity/               ← DBテーブル対応クラス（@Entity）
│   │   │   │   ├── Employee.java
│   │   │   │   └── Department.java
│   │   │   │
│   │   │   ├── config/               ← Spring Security 設定
│   │   │   │   └── SecurityConfig.java
│   │   │   │
│   │   │   └── EmployeeApplication.java  ← 起動クラス（main メソッド）
│   │   │
│   │   └── resources/
│   │       ├── application.properties    ← DB接続・設定（.env.local に相当）
│   │       ├── static/
│   │       │   └── css/style.css         ← スタイルシート
│   │       └── templates/                ← Thymeleaf HTMLテンプレート
│   │           ├── layout.html           ← 共通レイアウト
│   │           ├── login.html            ← ログイン画面
│   │           ├── employees/
│   │           │   ├── list.html         ← 社員一覧
│   │           │   ├── detail.html       ← 社員詳細
│   │           │   ├── form.html         ← 登録・編集フォーム
│   │           │   └── confirm_delete.html ← 削除確認
│   │           └── departments/
│   │               └── list.html         ← 部署一覧
│   │
│   └── test/                             ← テストコード
│
└── pom.xml                               ← 依存ライブラリ（package.json に相当）
```

---

### 3-3. データベース設計

```sql
-- 部署テーブル
CREATE TABLE departments (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    name        VARCHAR(100) NOT NULL,        -- 部署名（例: 営業部）
    created_at  TIMESTAMP DEFAULT NOW()
);

-- 社員テーブル
CREATE TABLE employees (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,    -- 氏名
    name_kana       VARCHAR(100),             -- フリガナ
    email           VARCHAR(255) UNIQUE,      -- メールアドレス
    phone           VARCHAR(20),              -- 電話番号
    hire_date       DATE NOT NULL,            -- 入社日
    birth_date      DATE,                     -- 生年月日
    position        VARCHAR(100),             -- 役職（例: 課長）
    department_id   BIGINT REFERENCES departments(id), -- 部署（外部キー）
    is_active       BOOLEAN DEFAULT TRUE,     -- 在籍中かどうか
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ユーザー（ログイン用）テーブル
CREATE TABLE users (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    username    VARCHAR(100) UNIQUE NOT NULL, -- ログインID
    password    VARCHAR(255) NOT NULL,        -- bcryptハッシュ
    role        VARCHAR(20) DEFAULT 'USER',   -- ADMIN / USER
    employee_id BIGINT REFERENCES employees(id) -- 社員と紐付け
);
```

```
テーブルの関係図

departments ─────────────────────────────────────────────┐
  id                                                       │
  name                                                     │ 1対多
                                                           ▼
                                                     ┌──────────────┐
                                                     │  employees   │
                                                     │  id(PK)      │
                                                     │  name        │
                                                     │  email       │
                                                     │  hire_date   │
                                                     │  department_id(FK)
                                                     │  is_active   │
                                                     └──────┬───────┘
                                                            │ 1対1
                                                            ▼
                                                     ┌──────────────┐
                                                     │   users      │
                                                     │  id(PK)      │
                                                     │  username    │
                                                     │  password    │
                                                     │  role        │
                                                     │  employee_id(FK)
                                                     └──────────────┘
```

---

### 3-4. Controllerの実装例

```java
@Controller
@RequestMapping("/employees")
public class EmployeeController {

    @Autowired
    private EmployeeService employeeService;

    @Autowired
    private DepartmentService departmentService;

    // ── 一覧表示 ──────────────────────────────────────────────
    // Card Manager Pro: api.fetchItems() + InventoryList.tsx に相当
    @GetMapping
    public String list(
            @RequestParam(required = false) String keyword,  // 検索キーワード
            @RequestParam(defaultValue = "1") int page,      // ページ番号
            Model model) {

        Page<Employee> employees = employeeService.findAll(keyword, page);
        model.addAttribute("employees", employees);
        model.addAttribute("keyword", keyword);
        return "employees/list";  // templates/employees/list.html
    }

    // ── 登録フォーム表示 ───────────────────────────────────────
    @GetMapping("/add")
    public String addForm(Model model) {
        model.addAttribute("employee", new Employee());
        model.addAttribute("departments", departmentService.findAll());
        return "employees/form";
    }

    // ── 登録実行 ───────────────────────────────────────────────
    // Card Manager Pro: api.addItem() に相当
    @PostMapping("/add")
    public String add(
            @Valid @ModelAttribute Employee employee,  // バリデーション
            BindingResult result,                       // エラー結果
            Model model) {

        if (result.hasErrors()) {
            model.addAttribute("departments", departmentService.findAll());
            return "employees/form";  // エラーがあれば入力画面に戻る
        }

        employeeService.save(employee);
        return "redirect:/employees";  // 一覧にリダイレクト
    }

    // ── 編集フォーム表示 ───────────────────────────────────────
    @GetMapping("/{id}/edit")
    public String editForm(@PathVariable Long id, Model model) {
        Employee employee = employeeService.findById(id);
        model.addAttribute("employee", employee);
        model.addAttribute("departments", departmentService.findAll());
        return "employees/form";
    }

    // ── 編集実行 ───────────────────────────────────────────────
    // Card Manager Pro: api.updateItem() に相当
    @PostMapping("/{id}/edit")
    public String edit(
            @PathVariable Long id,
            @Valid @ModelAttribute Employee employee,
            BindingResult result,
            Model model) {

        if (result.hasErrors()) {
            model.addAttribute("departments", departmentService.findAll());
            return "employees/form";
        }

        employeeService.update(id, employee);
        return "redirect:/employees";
    }

    // ── 削除 ──────────────────────────────────────────────────
    // Card Manager Pro: api.deleteItem() に相当
    @PostMapping("/{id}/delete")
    public String delete(@PathVariable Long id) {
        employeeService.delete(id);
        return "redirect:/employees";
    }
}
```

---

### 3-5. Service の実装例

```java
// Card Manager Pro でいう api.ts の各関数に相当
@Service
public class EmployeeService {

    @Autowired
    private EmployeeRepository employeeRepository;

    // 全件取得（キーワード検索 + ページネーション）
    public Page<Employee> findAll(String keyword, int page) {
        Pageable pageable = PageRequest.of(page - 1, 20,
            Sort.by("hireDate").descending());

        if (keyword != null && !keyword.isEmpty()) {
            return employeeRepository.findByNameContaining(keyword, pageable);
        }
        return employeeRepository.findAll(pageable);
    }

    // 1件取得
    public Employee findById(Long id) {
        return employeeRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("社員が見つかりません: " + id));
    }

    // 登録・更新
    @Transactional
    public void save(Employee employee) {
        employeeRepository.save(employee);
    }

    // 削除（論理削除）
    @Transactional
    public void delete(Long id) {
        Employee employee = findById(id);
        employee.setActive(false);    // DBからは消さず、フラグを立てる
        employeeRepository.save(employee);
    }
}
```

---

### 3-6. Repository の実装例

```java
// Card Manager Pro でいう Supabase クライアントへの問い合わせに相当
// JpaRepository を継承するだけで基本操作が全部使える
@Repository
public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    // メソッド名だけでSQLを自動生成してくれる
    Page<Employee> findByNameContaining(String keyword, Pageable pageable);
    // → SELECT * FROM employees WHERE name LIKE '%keyword%' LIMIT ? OFFSET ?

    List<Employee> findByDepartmentId(Long deptId);
    // → SELECT * FROM employees WHERE department_id = ?

    List<Employee> findByIsActiveTrue();
    // → SELECT * FROM employees WHERE is_active = true
}
```

---

## 4. 必要なもの一覧

---

### 4-1. 開発環境

```
インストールが必要なもの

  ┌────────────────────────────────────────────────────────────────┐
  │  ツール              │  役割                  │  備考           │
  ├────────────────────────────────────────────────────────────────┤
  │  JDK 17 以上         │  Javaの実行環境         │  必須           │
  │  IntelliJ IDEA       │  統合開発環境(IDE)      │  推奨（無料版可）│
  │    または Eclipse    │                        │                 │
  │  PostgreSQL          │  データベース           │  または H2(開発用)│
  │  Maven または Gradle │  ビルドツール           │  Spring Initializr│
  │                      │                        │  で自動生成      │
  └────────────────────────────────────────────────────────────────┘
```

---

### 4-2. pom.xml（必要なライブラリ）

```xml
<!-- pom.xml（Mavenの場合） package.json に相当 -->
<dependencies>

    <!-- Spring MVC + Thymeleaf（画面表示） -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-thymeleaf</artifactId>
    </dependency>

    <!-- Spring Data JPA（DB操作を自動化） -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>

    <!-- Spring Security（ログイン・権限管理） -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-security</artifactId>
    </dependency>

    <!-- バリデーション（@NotNull, @Email 等） -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>

    <!-- PostgreSQL ドライバ（Oracle なら ojdbc に変える） -->
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
    </dependency>

    <!-- Lombok（getter/setter自動生成で記述量を減らす） -->
    <dependency>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <optional>true</optional>
    </dependency>

</dependencies>
```

---

## 5. 学習ロードマップ

---

```
【フェーズ1】 Spring Boot の基本を理解する（1〜2週間）

  やること:
  ├─ Spring Initializr (start.spring.io) でプロジェクト生成
  ├─ @Controller + Thymeleaf で Hello World を画面表示
  ├─ @Entity + JpaRepository で簡単なCRUDを実装
  └─ application.properties で DB接続

  理解できる目安:
  └─ ブラウザから社員を1件登録してDBに保存できる

──────────────────────────────────────────────────────────────

【フェーズ2】 社員一覧・登録・編集・削除を実装（1〜2週間）

  やること:
  ├─ 社員一覧画面（検索・ページネーション）
  ├─ 登録フォーム（バリデーション付き）
  ├─ 編集フォーム
  └─ 削除（論理削除）

  Card Manager Proとの対応:
  └─ InventoryList.tsx → list.html の実装

──────────────────────────────────────────────────────────────

【フェーズ3】 認証・権限管理を実装（1週間）

  やること:
  ├─ Spring Security でログイン画面
  ├─ ROLE_ADMIN のみ編集・削除できるように制限
  └─ CSRF対策（Springが自動でやってくれる）

  Card Manager Proとの対応:
  └─ isAdmin チェック → @PreAuthorize や SecurityConfig

──────────────────────────────────────────────────────────────

【フェーズ4】 仕上げ（1週間）

  やること:
  ├─ 部署マスタ管理
  ├─ CSVエクスポート
  └─ 画面デザイン整理（Bootstrap等）
```

---

## まとめ：Card Manager Pro からの知識の活かし方

```
すでにわかっている（Card Manager Pro で学んだ）
  ✅ テーブル設計・主キー・外部キー・1対多の関係
  ✅ CRUD操作（SELECT/INSERT/UPDATE/DELETE）の考え方
  ✅ 画面 → ロジック → DB → 画面 の流れ
  ✅ 検索・フィルタ・ページネーションの概念
  ✅ 認証（ログイン/権限）の概念
  ✅ バリデーション（入力チェック）の必要性

新たに学ぶ（Spring固有）
  📖 アノテーション（@Controller, @Service, @Entity 等）
  📖 DI（依存性注入）と @Autowired
  📖 Spring Data JPA（SQLを自動生成）
  📖 Thymeleaf（HTMLテンプレートの書き方）
  📖 Spring Security（ログイン画面・権限）
  📖 @Transactional（トランザクション管理）
  📖 application.properties（設定ファイル）
  📖 pom.xml（依存ライブラリの管理）

→ 「何をしたいか」はすでにわかっている。
  「Springでどう書くか」を覚えれば完成できる。
```
