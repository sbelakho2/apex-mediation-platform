// console/src/app/admin/sales-automation/page.tsx
// Sales Automation Dashboard - Cialdini's 6 Principles Performance
// Monitors conversion funnel, principle effectiveness, and campaign ROI

export default function SalesAutomationDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🎯 Sales Automation Dashboard
          </h1>
          <p className="text-lg text-gray-600">
            Cialdini&apos;s 6 Principles in Action - Real-time conversion analytics
          </p>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Trial → Paid"
            value="42.3%"
            change="+112%"
            trend="up"
            subtitle="vs. 20% baseline"
            color="green"
          />
          <MetricCard
            title="Avg Deal Size"
            value="$247"
            change="+65%"
            trend="up"
            subtitle="vs. $150 target"
            color="blue"
          />
          <MetricCard
            title="Time to Convert"
            value="11.2 days"
            change="-37%"
            trend="down"
            subtitle="vs. 14-day trial"
            color="purple"
          />
          <MetricCard
            title="Active Trials"
            value="147"
            change="+23"
            trend="up"
            subtitle="this week"
            color="orange"
          />
        </div>

        {/* Principle Effectiveness */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            📊 Principle Effectiveness
          </h2>
          <p className="text-gray-600 mb-6">
            Which psychological principles drive the highest conversions?
          </p>
          
          <div className="space-y-4">
            <PrincipleBar
              principle="Commitment & Consistency"
              description="Micro-commitments during trial"
              conversionRate={45.2}
              timesUsed={1247}
              revenue={124700}
              color="green"
              icon="✓"
            />
            <PrincipleBar
              principle="Scarcity"
              description="Trial ending urgency"
              conversionRate={41.8}
              timesUsed={1150}
              revenue={118200}
              color="red"
              icon="⏰"
            />
            <PrincipleBar
              principle="Reciprocity"
              description="Gifts before asking"
              conversionRate={38.5}
              timesUsed={1390}
              revenue={134650}
              color="blue"
              icon="🎁"
            />
            <PrincipleBar
              principle="Social Proof"
              description="Similar customer success"
              conversionRate={36.2}
              timesUsed={980}
              revenue={88900}
              color="purple"
              icon="👥"
            />
            <PrincipleBar
              principle="Authority"
              description="Expert credentials"
              conversionRate={33.1}
              timesUsed={1200}
              revenue={99600}
              color="orange"
              icon="🎓"
            />
            <PrincipleBar
              principle="Liking"
              description="Similarity matching"
              conversionRate={31.5}
              timesUsed={1450}
              revenue={114500}
              color="pink"
              icon="❤️"
            />
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            🔄 Conversion Funnel
          </h2>
          <p className="text-gray-600 mb-6">
            Customer journey through sales stages
          </p>

          <div className="space-y-3">
            <FunnelStage
              stage="Signup"
              count={1000}
              percentage={100}
              avgDays={0}
              engagementScore={25}
              color="gray"
            />
            <FunnelStage
              stage="Activation"
              count={850}
              percentage={85}
              avgDays={1.2}
              engagementScore={45}
              color="blue"
            />
            <FunnelStage
              stage="Engagement"
              count={720}
              percentage={72}
              avgDays={3.5}
              engagementScore={68}
              color="indigo"
            />
            <FunnelStage
              stage="Evaluation"
              count={580}
              percentage={58}
              avgDays={8.2}
              engagementScore={75}
              color="purple"
            />
            <FunnelStage
              stage="Conversion"
              count={423}
              percentage={42.3}
              avgDays={11.2}
              engagementScore={88}
              color="green"
            />
          </div>

          <div className="mt-6 p-4 bg-green-50 rounded-lg">
            <p className="text-green-800 font-semibold">
              💡 Insight: 85% activation rate is excellent. Focus on moving Engagement → Evaluation faster.
            </p>
          </div>
        </div>

        {/* 14-Day Journey Performance */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            📅 14-Day Journey Performance
          </h2>
          <p className="text-gray-600 mb-6">
            Touchpoint engagement by day
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Day</th>
                  <th className="text-left py-3 px-4">Touchpoint</th>
                  <th className="text-left py-3 px-4">Principle</th>
                  <th className="text-center py-3 px-4">Sent</th>
                  <th className="text-center py-3 px-4">Open Rate</th>
                  <th className="text-center py-3 px-4">Click Rate</th>
                  <th className="text-center py-3 px-4">Impact</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <TouchpointRow day={0} title="Welcome Gift" principle="Reciprocity" sent={1000} openRate={62} clickRate={45} impact="High" />
                <TouchpointRow day={1} title="Benchmark Report" principle="Authority" sent={980} openRate={58} clickRate={42} impact="High" />
                <TouchpointRow day={3} title="Surprise Bonus" principle="Reciprocity" sent={920} openRate={71} clickRate={58} impact="Very High" />
                <TouchpointRow day={6} title="Premium Unlock" principle="Reciprocity" sent={850} openRate={65} clickRate={52} impact="High" />
                <TouchpointRow day={8} title="Case Study" principle="Social Proof" sent={780} openRate={54} clickRate={38} impact="Medium" />
                <TouchpointRow day={11} title="3-Day Warning" principle="Scarcity" sent={680} openRate={78} clickRate={61} impact="Very High" />
                <TouchpointRow day={13} title="Final Push" principle="All 6" sent={520} openRate={85} clickRate={72} impact="Critical" />
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Conversions */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            🎉 Recent Conversions
          </h2>
          <p className="text-gray-600 mb-6">
            Latest trial → paid upgrades with principle attribution
          </p>

          <div className="space-y-3">
            <ConversionCard
              company="Puzzle Master Studios"
              mrr={299}
              daysInTrial={10}
              principle="Commitment"
              milestonesCompleted={12}
              conversionProbability={87}
            />
            <ConversionCard
              company="Casual Games Inc"
              mrr={199}
              daysInTrial={13}
              principle="Scarcity"
              milestonesCompleted={8}
              conversionProbability={72}
            />
            <ConversionCard
              company="AdventureCraft"
              mrr={399}
              daysInTrial={11}
              principle="Social Proof"
              milestonesCompleted={15}
              conversionProbability={91}
            />
            <ConversionCard
              company="Indie Dev Co"
              mrr={149}
              daysInTrial={12}
              principle="Reciprocity"
              milestonesCompleted={9}
              conversionProbability={68}
            />
          </div>
        </div>

        {/* A/B Tests */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            🧪 Active A/B Tests
          </h2>
          <p className="text-gray-600 mb-6">
            Ongoing experiments to optimize conversion
          </p>

          <div className="space-y-4">
            <ABTestCard
              testName="Subject Line: Urgency vs Benefit"
              hypothesis="Urgency-based subject lines increase open rates"
              controlRate={58}
              testRate={71}
              confidence={95}
              winner="test"
              recommendation="Roll out urgency-based subject lines"
            />
            <ABTestCard
              testName="Day 3 Timing: Morning vs Evening"
              hypothesis="Evening sends have higher engagement"
              controlRate={62}
              testRate={59}
              confidence={78}
              winner="control"
              recommendation="Keep morning sends for Day 3"
            />
            <ABTestCard
              testName="Social Proof: Generic vs Specific"
              hypothesis="Specific numbers increase credibility"
              controlRate={42}
              testRate={51}
              confidence={92}
              winner="test"
              recommendation="Use specific numbers in all social proof"
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            ⚡ Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ActionButton
              title="View Campaign Settings"
              description="Adjust touchpoint timing and content"
              icon="⚙️"
            />
            <ActionButton
              title="Export Conversion Data"
              description="Download detailed attribution report"
              icon="📥"
            />
            <ActionButton
              title="Run AI Optimization"
              description="Get GPT-4 recommendations"
              icon="🤖"
            />
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <p className="text-blue-900 text-sm">
            <strong>💡 Pro Tip:</strong> Commitment & Consistency is your strongest principle (45.2% conversion). 
            Consider adding more micro-commitment opportunities in Days 4-7 to maintain momentum.
          </p>
        </div>
      </div>
    </div>
  );
}

// Component: Metric Card
function MetricCard({ 
  title, 
  value, 
  change, 
  trend, 
  subtitle, 
  color 
}: {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  subtitle: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    orange: 'bg-orange-50 text-orange-700'
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mb-2">{value}</p>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${colorClasses[color]}`}>
          {trend === 'up' ? '↑' : '↓'} {change}
        </span>
        <span className="text-xs text-gray-500">{subtitle}</span>
      </div>
    </div>
  );
}

// Component: Principle Bar
function PrincipleBar({
  principle,
  description,
  conversionRate,
  timesUsed,
  revenue,
  color,
  icon
}: {
  principle: string;
  description: string;
  conversionRate: number;
  timesUsed: number;
  revenue: number;
  color: string;
  icon: string;
}) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500'
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="font-semibold text-gray-900">{principle}</p>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">{conversionRate}%</p>
          <p className="text-xs text-gray-500">{timesUsed} uses · ${(revenue/1000).toFixed(0)}K</p>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${colorClasses[color]} h-2 rounded-full`}
          style={{ width: `${conversionRate}%` }}
        />
      </div>
    </div>
  );
}

// Component: Funnel Stage
function FunnelStage({
  stage,
  count,
  percentage,
  avgDays,
  engagementScore,
  color
}: {
  stage: string;
  count: number;
  percentage: number;
  avgDays: number;
  engagementScore: number;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    gray: 'bg-gray-500',
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500'
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-32 text-right">
        <p className="font-semibold text-gray-900">{stage}</p>
        <p className="text-xs text-gray-500">{avgDays.toFixed(1)} days avg</p>
      </div>
      <div className="flex-1">
        <div className="w-full bg-gray-200 rounded-full h-8 relative">
          <div
            className={`${colorClasses[color]} h-8 rounded-full flex items-center justify-between px-4`}
            style={{ width: `${percentage}%` }}
          >
            <span className="text-white font-semibold">{count} customers</span>
            <span className="text-white text-sm">{percentage}%</span>
          </div>
        </div>
      </div>
      <div className="w-24">
        <p className="text-sm text-gray-600">
          Engagement: <span className="font-semibold">{engagementScore}</span>
        </p>
      </div>
    </div>
  );
}

// Component: Touchpoint Row
function TouchpointRow({
  day,
  title,
  principle,
  sent,
  openRate,
  clickRate,
  impact
}: {
  day: number;
  title: string;
  principle: string;
  sent: number;
  openRate: number;
  clickRate: number;
  impact: string;
}) {
  const impactColors: Record<string, string> = {
    'Very High': 'text-green-700 bg-green-100',
    'High': 'text-blue-700 bg-blue-100',
    'Medium': 'text-yellow-700 bg-yellow-100',
    'Critical': 'text-red-700 bg-red-100'
  };

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-3 px-4 font-semibold">Day {day}</td>
      <td className="py-3 px-4">{title}</td>
      <td className="py-3 px-4 text-gray-600">{principle}</td>
      <td className="py-3 px-4 text-center">{sent}</td>
      <td className="py-3 px-4 text-center font-semibold">{openRate}%</td>
      <td className="py-3 px-4 text-center font-semibold">{clickRate}%</td>
      <td className="py-3 px-4 text-center">
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${impactColors[impact]}`}>
          {impact}
        </span>
      </td>
    </tr>
  );
}

// Component: Conversion Card
function ConversionCard({
  company,
  mrr,
  daysInTrial,
  principle,
  milestonesCompleted,
  conversionProbability
}: {
  company: string;
  mrr: number;
  daysInTrial: number;
  principle: string;
  milestonesCompleted: number;
  conversionProbability: number;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-semibold text-gray-900">{company}</p>
          <p className="text-sm text-gray-600">Converted on Day {daysInTrial}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-green-600">${mrr}<span className="text-sm text-gray-500">/mo</span></p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600">
          Principle: <span className="font-semibold text-purple-600">{principle}</span>
        </span>
        <span className="text-gray-600">
          Milestones: <span className="font-semibold">{milestonesCompleted}</span>
        </span>
        <span className="text-gray-600">
          Probability: <span className="font-semibold text-green-600">{conversionProbability}%</span>
        </span>
      </div>
    </div>
  );
}

// Component: A/B Test Card
function ABTestCard({
  testName,
  hypothesis,
  controlRate,
  testRate,
  confidence,
  winner,
  recommendation
}: {
  testName: string;
  hypothesis: string;
  controlRate: number;
  testRate: number;
  confidence: number;
  winner: string;
  recommendation: string;
}) {
  const isTestWinner = winner === 'test';
  const lift = ((testRate - controlRate) / controlRate * 100).toFixed(1);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">{testName}</p>
          <p className="text-sm text-gray-600">{hypothesis}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
          confidence >= 95 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {confidence}% confident
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Control</p>
          <p className={`text-2xl font-bold ${isTestWinner ? 'text-gray-400' : 'text-green-600'}`}>
            {controlRate}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Test</p>
          <p className={`text-2xl font-bold ${isTestWinner ? 'text-green-600' : 'text-gray-400'}`}>
            {testRate}%
          </p>
        </div>
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>📊 Result:</strong> {isTestWinner ? 'Test' : 'Control'} won with {Math.abs(parseFloat(lift))}% {parseFloat(lift) > 0 ? 'lift' : 'drop'}
        </p>
        <p className="text-sm text-blue-800 mt-1">
          <strong>💡 Recommendation:</strong> {recommendation}
        </p>
      </div>
    </div>
  );
}

// Component: Action Button
function ActionButton({
  title,
  description,
  icon
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <button className="border-2 border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition-all text-left">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="font-semibold text-gray-900 mb-1">{title}</p>
      <p className="text-sm text-gray-600">{description}</p>
    </button>
  );
}
